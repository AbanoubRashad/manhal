import { badRequest, notFound, forbidden, conflict } from '../lib/errors.js';
import { randomToken } from '../lib/crypto.js';
import { sqlTime } from '../lib/time.js';

export function learningService({ db, catalog, video, now = () => new Date() }) {
  const enrollment = (userId, courseId) => db.get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', userId, courseId);
  const canTeach = (user, course) => user && (user.role === 'admin' || course.instructor_id === user.id);

  function lessonFor(user, lessonId) {
    const l = db.get('SELECT * FROM lessons WHERE id = ?', lessonId);
    if (!l) throw notFound("We couldn't find that lesson.");
    const course = catalog.row(l.course_id);
    return { l, course, enrolled: Boolean(enrollment(user.id, l.course_id)), teacher: canTeach(user, course) };
  }
  function requireEnrolled(user, courseId) {
    const course = catalog.row(courseId);
    if (!course) throw notFound("We couldn't find that course.");
    if (!enrollment(user.id, courseId) && !canTeach(user, course)) throw forbidden('Enroll in this course to continue.');
    return course;
  }

  function streak(userId) {
    const days = new Set(db.all('SELECT DISTINCT substr(completed_at,1,10) AS d FROM lesson_progress WHERE user_id = ?', userId).map(r => r.d));
    let n = 0;
    const d = new Date(now());
    if (!days.has(sqlTime(d).slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1); // today not started yet
    while (days.has(sqlTime(d).slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
    return n;
  }

  /** Minutes learned per day for the last `days` days (oldest first), from completed lessons. */
  function minutesByDay(userId, days) {
    const start = new Date(now()); start.setUTCDate(start.getUTCDate() - (days - 1));
    const rows = db.all(`SELECT substr(p.completed_at,1,10) AS d, SUM(l.minutes) AS m FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
      WHERE p.user_id = ? AND p.completed_at >= ? GROUP BY d`, userId, sqlTime(start).slice(0, 10));
    const map = Object.fromEntries(rows.map(r => [r.d, r.m]));
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
      const key = sqlTime(d).slice(0, 10);
      return { date: key, minutes: map[key] || 0 };
    });
  }

  return {
    requireEnrolled,
    enrollFree(user, courseId) {
      const c = catalog.row(courseId);
      if (!c || c.status !== 'published') throw notFound("We couldn't find that course.");
      if (c.price > 0) throw badRequest('This course is paid. Add it to your cart to enroll.');
      db.run("INSERT OR IGNORE INTO enrollments (user_id, course_id, source) VALUES (?, ?, 'free')", user.id, courseId);
      return { enrolled: true, slug: c.slug };
    },

    dashboard(user) {
      const rows = db.all('SELECT course_id, created_at FROM enrollments WHERE user_id = ? ORDER BY created_at DESC', user.id);
      const courses = rows.map(r => {
        const card = catalog.cardById(r.course_id);
        if (!card) return null;
        const progress = catalog.progressFor(user.id, r.course_id);
        const next = db.get(`SELECT id, title_en, title_ar FROM lessons WHERE course_id = ? AND id NOT IN
          (SELECT lesson_id FROM lesson_progress WHERE user_id = ?) ORDER BY position LIMIT 1`, r.course_id, user.id);
        const cert = db.get('SELECT code FROM certificates WHERE user_id = ? AND course_id = ?', user.id, r.course_id);
        return { ...card, progress, certificate: cert?.code ?? null, next: next ? { id: next.id, title: { en: next.title_en, ar: next.title_ar || next.title_en } } : null };
      }).filter(Boolean);
      const week = minutesByDay(user.id, 7);
      const heat = minutesByDay(user.id, 84);
      const wishIds = db.all('SELECT course_id FROM wishlist WHERE user_id = ? ORDER BY created_at DESC', user.id).map(r => r.course_id);
      return {
        courses,
        stats: {
          streak: streak(user.id),
          weekMinutes: week.reduce((a, d) => a + d.minutes, 0),
          inProgress: courses.filter(c => c.progress.percent < 100).length,
          completed: courses.filter(c => c.progress.percent === 100).length,
        },
        week, heat,
        wishlist: catalog.list({ ids: wishIds }, user.id),
      };
    },

    /** Everything the lesson player needs. Free courses enroll on first open, like the prototype. */
    player(user, slug) {
      const course = db.get('SELECT * FROM courses WHERE slug = ?', slug);
      if (!course) throw notFound("We couldn't find that course.");
      let e = enrollment(user.id, course.id);
      if (!e && course.price === 0 && course.status === 'published') {
        db.run("INSERT OR IGNORE INTO enrollments (user_id, course_id, source) VALUES (?, ?, 'free')", user.id, course.id);
        e = enrollment(user.id, course.id);
      }
      if (!e && !canTeach(user, course)) throw forbidden('Enroll in this course to start learning.');
      const done = db.all(`SELECT p.lesson_id FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE p.user_id = ? AND l.course_id = ?`,
        user.id, course.id).map(r => r.lesson_id);
      const cert = db.get('SELECT code, name FROM certificates WHERE user_id = ? AND course_id = ?', user.id, course.id);
      return {
        course: catalog.cardById(course.id),
        sections: catalog.outline(course.id),
        done, lastLessonId: e?.last_lesson_id ?? null, quizPassed: Boolean(e?.quiz_passed),
        quizCount: db.get('SELECT COUNT(*) AS n FROM quiz_questions WHERE course_id = ?', course.id).n,
        progress: catalog.progressFor(user.id, course.id) || { done: done.length, total: 0, quizPassed: false, percent: 0 },
        certificate: cert || null,
        previewOnly: !e,
      };
    },

    /** Signed / embeddable playback for a lesson. Only enrolled learners, the instructor and admins (or anyone for preview lessons). */
    play(user, lessonId) {
      const l = db.get('SELECT * FROM lessons WHERE id = ?', lessonId);
      if (!l) throw notFound("We couldn't find that lesson.");
      const course = catalog.row(l.course_id);
      const allowed = l.is_preview && course.status === 'published' || (user && (enrollment(user.id, l.course_id) || canTeach(user, course)));
      if (!allowed) throw forbidden('Enroll in this course to watch this lesson.');
      if (user && enrollment(user.id, l.course_id)) db.run('UPDATE enrollments SET last_lesson_id = ? WHERE user_id = ? AND course_id = ?', l.id, user.id, l.course_id);
      return video.playback(l);
    },

    complete(user, lessonId) {
      const { l, enrolled } = lessonFor(user, lessonId);
      if (!enrolled) throw forbidden('Enroll in this course to track progress.');
      db.run('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)', user.id, l.id, sqlTime(now()));
      db.run('UPDATE enrollments SET last_lesson_id = ? WHERE user_id = ? AND course_id = ?', l.id, user.id, l.course_id);
      return catalog.progressFor(user.id, l.course_id);
    },

    getNote(user, lessonId) {
      const { l, enrolled, teacher } = lessonFor(user, lessonId);
      if (!enrolled && !teacher) throw forbidden('Enroll in this course to keep notes.');
      return { body: db.get('SELECT body FROM notes WHERE user_id = ? AND lesson_id = ?', user.id, l.id)?.body ?? '' };
    },
    saveNote(user, lessonId, body) {
      const { l, enrolled, teacher } = lessonFor(user, lessonId);
      if (!enrolled && !teacher) throw forbidden('Enroll in this course to keep notes.');
      if (!body) db.run('DELETE FROM notes WHERE user_id = ? AND lesson_id = ?', user.id, l.id);
      else db.run(`INSERT INTO notes (user_id, lesson_id, body, updated_at) VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, lesson_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, user.id, l.id, body);
      return { saved: true };
    },

    quiz(user, courseId) {
      requireEnrolled(user, courseId);
      return {
        passMark: passMark(db.get('SELECT COUNT(*) AS n FROM quiz_questions WHERE course_id = ?', courseId).n),
        questions: db.all('SELECT id, prompt, options_json FROM quiz_questions WHERE course_id = ? ORDER BY position', courseId)
          .map(q => ({ id: q.id, prompt: q.prompt, options: JSON.parse(q.options_json) })),
      };
    },
    submitQuiz(user, courseId, answers) {
      requireEnrolled(user, courseId);
      const qs = db.all('SELECT id, answer FROM quiz_questions WHERE course_id = ? ORDER BY position', courseId);
      if (!qs.length) throw badRequest('This course has no checkpoint yet.');
      if (answers.length !== qs.length) throw badRequest('Answer every question first.');
      const score = qs.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);
      const passed = score >= passMark(qs.length);
      db.run('INSERT INTO quiz_attempts (user_id, course_id, score, total, passed) VALUES (?, ?, ?, ?, ?)', user.id, courseId, score, qs.length, passed ? 1 : 0);
      if (passed) db.run('UPDATE enrollments SET quiz_passed = 1 WHERE user_id = ? AND course_id = ?', user.id, courseId);
      return { score, total: qs.length, passed, answers: qs.map(q => q.answer), progress: catalog.progressFor(user.id, courseId) };
    },

    /** Issue (or rename) the certificate once every lesson is done and the checkpoint is passed. */
    certificate(user, courseId, name) {
      if (!enrollment(user.id, courseId)) throw forbidden('Enroll in this course first.');
      const p = catalog.progressFor(user.id, courseId);
      if (p.percent < 100) throw conflict('Finish every lesson and pass the checkpoint to get your certificate.');
      const existing = db.get('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', user.id, courseId);
      if (existing) {
        if (name && name !== existing.name) db.run('UPDATE certificates SET name = ? WHERE code = ?', name, existing.code);
        return this.verify(existing.code);
      }
      const code = `MNL-${randomToken(9).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X')}-${randomToken(9).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6).padEnd(6, 'Z')}`;
      db.run('INSERT INTO certificates (code, user_id, course_id, name) VALUES (?, ?, ?, ?)', code, user.id, courseId, name || user.name);
      return this.verify(code);
    },
    /** Public verification of a certificate code. */
    verify(code) {
      const c = db.get(`SELECT ce.*, co.slug, co.title_en, co.title_ar, u.name AS instructor, u.headline FROM certificates ce
        JOIN courses co ON co.id = ce.course_id JOIN users u ON u.id = co.instructor_id WHERE ce.code = ?`, String(code).toUpperCase());
      if (!c) throw notFound("We couldn't find a certificate with that ID. Check it and try again.");
      return { code: c.code, name: c.name, issuedAt: c.issued_at, course: { id: c.course_id, slug: c.slug, title: { en: c.title_en, ar: c.title_ar || c.title_en } }, instructor: { name: c.instructor, headline: c.headline } };
    },
    myCertificates: userId => db.all('SELECT code FROM certificates WHERE user_id = ? ORDER BY issued_at DESC', userId),
  };
}

export const passMark = total => Math.ceil(total * 2 / 3);
