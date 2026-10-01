import { badRequest, notFound, forbidden } from '../lib/errors.js';
import { parseVideoUrl } from '../lib/video.js';

export const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'course';

/** Instructor studio: create and edit courses, curriculum and checkpoint quiz. */
export function studioService({ db, catalog }) {
  function own(user, id) {
    const c = catalog.row(id);
    if (!c) throw notFound("We couldn't find that course.");
    if (user.role !== 'admin' && c.instructor_id !== user.id) throw forbidden('You can only edit your own courses.');
    return c;
  }
  function uniqueSlug(base, exceptId = 0) {
    let slug = base, n = 2;
    while (db.get('SELECT 1 FROM courses WHERE slug = ? AND id != ?', slug, exceptId)) slug = `${base}-${n++}`;
    return slug;
  }
  /** Reasons a course can't be published yet (empty when it's ready). */
  function publishProblems(id) {
    const c = catalog.row(id), out = [];
    if (!c.summary_en) out.push('Add a short summary.');
    const lessons = db.get('SELECT COUNT(*) AS n FROM lessons WHERE course_id = ?', id).n;
    if (!lessons) out.push('Add at least one lesson.');
    if (db.get('SELECT COUNT(*) AS n FROM sections s WHERE course_id = ? AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.section_id = s.id)', id).n) out.push('Every section needs at least one lesson.');
    if (!db.get('SELECT COUNT(*) AS n FROM quiz_questions WHERE course_id = ?', id).n) out.push('Add at least one checkpoint question.');
    return out;
  }

  function full(id) {
    const c = catalog.row(id);
    const sections = db.all('SELECT * FROM sections WHERE course_id = ? ORDER BY position', id);
    const lessons = db.all('SELECT * FROM lessons WHERE course_id = ? ORDER BY position', id);
    return {
      id: c.id, slug: c.slug, status: c.status, category: c.category, level: c.level, price: c.price,
      title_en: c.title_en, title_ar: c.title_ar, summary_en: c.summary_en, summary_ar: c.summary_ar,
      updatedAt: c.updated_at,
      sections: sections.map(s => ({
        id: s.id, title_en: s.title_en, title_ar: s.title_ar,
        lessons: lessons.filter(l => l.section_id === s.id).map(l => ({
          id: l.id, title_en: l.title_en, title_ar: l.title_ar, minutes: l.minutes, is_preview: Boolean(l.is_preview),
          video_provider: l.video_provider, video_url: l.video_url, video_ref: l.video_ref,
        })),
      })),
      quiz: db.all('SELECT * FROM quiz_questions WHERE course_id = ? ORDER BY position', id)
        .map(q => ({ prompt: q.prompt, options: JSON.parse(q.options_json), answer: q.answer })),
      problems: publishProblems(id),
      stats: db.get(`SELECT (SELECT COUNT(*) FROM enrollments WHERE course_id = ?) AS learners,
        (SELECT COALESCE(SUM(amount),0) FROM earnings WHERE course_id = ?) AS earned`, id, id),
    };
  }

  return {
    publishProblems, full,
    list(user) {
      const rows = db.all(`SELECT c.id FROM courses c WHERE c.instructor_id = ? ORDER BY c.updated_at DESC, c.id DESC`, user.id);
      return rows.map(r => {
        const card = catalog.cardById(r.id);
        const s = db.get(`SELECT (SELECT COUNT(*) FROM enrollments WHERE course_id = ?) AS enrolled,
          (SELECT COALESCE(SUM(amount),0) FROM earnings WHERE course_id = ?) AS earned`, r.id, r.id);
        return { ...card, enrolledCount: s.enrolled, earned: s.earned };
      });
    },
    create(user, { title_en, category, level, price }) {
      if (!db.get('SELECT 1 FROM categories WHERE key = ?', category)) throw badRequest('Choose a category.', { fields: { category: 'Choose a category.' } });
      const { id } = db.run(`INSERT INTO courses (slug, instructor_id, category, level, title_en, price, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
        uniqueSlug(slugify(title_en)), user.id, category, level, title_en, price);
      return full(id);
    },
    get(user, id) { own(user, id); return full(id); },

    /** Save the whole course. Lessons keep their id (and learners' progress) when they're moved or renamed. */
    save(user, id, data) {
      const course = own(user, id);
      if (!db.get('SELECT 1 FROM categories WHERE key = ?', data.category)) throw badRequest('Choose a category.', { fields: { category: 'Choose a category.' } });
      data.sections.forEach((s, si) => s.lessons.forEach((l, li) => {
        const where = `Section ${si + 1}, lesson ${li + 1}`;
        if (l.video_provider === 'bunny' && !/^[0-9a-f-]{36}$/i.test(l.video_ref || '')) throw badRequest(`${where}: enter the Bunny Stream video ID (a 36-character GUID).`);
        if (l.video_provider !== 'bunny' && l.video_url && !parseVideoUrl(l.video_url)) throw badRequest(`${where}: use a YouTube, Vimeo or direct .mp4 link.`);
      }));
      data.quiz.forEach((q, i) => {
        if (q.answer >= q.options.length) throw badRequest(`Question ${i + 1}: choose which option is correct.`);
      });

      db.tx(() => {
        db.run(`UPDATE courses SET title_en = ?, title_ar = ?, summary_en = ?, summary_ar = ?, category = ?, level = ?, price = ?,
          updated_at = datetime('now') WHERE id = ?`, data.title_en, data.title_ar || '', data.summary_en || '', data.summary_ar || '',
          data.category, data.level, data.price, id);
        const oldSections = new Set(db.all('SELECT id FROM sections WHERE course_id = ?', id).map(r => r.id));
        const oldLessons = new Set(db.all('SELECT id FROM lessons WHERE course_id = ?', id).map(r => r.id));
        const keepS = new Set(), keepL = new Set();
        let pos = 0;
        data.sections.forEach((s, si) => {
          let sid = s.id;
          if (sid && oldSections.has(sid)) db.run('UPDATE sections SET position = ?, title_en = ?, title_ar = ? WHERE id = ?', si, s.title_en, s.title_ar || '', sid);
          else sid = db.run('INSERT INTO sections (course_id, position, title_en, title_ar) VALUES (?, ?, ?, ?)', id, si, s.title_en, s.title_ar || '').id;
          keepS.add(sid);
          for (const l of s.lessons) {
            const vals = [sid, pos++, l.title_en, l.title_ar || '', l.minutes, l.is_preview ? 1 : 0,
              l.video_provider === 'bunny' ? 'bunny' : 'url', l.video_provider === 'bunny' ? '' : (l.video_url || ''), l.video_provider === 'bunny' ? l.video_ref : ''];
            if (l.id && oldLessons.has(l.id)) {
              db.run(`UPDATE lessons SET section_id = ?, position = ?, title_en = ?, title_ar = ?, minutes = ?, is_preview = ?,
                video_provider = ?, video_url = ?, video_ref = ? WHERE id = ?`, ...vals, l.id);
              keepL.add(l.id);
            } else {
              keepL.add(db.run(`INSERT INTO lessons (section_id, position, title_en, title_ar, minutes, is_preview, video_provider, video_url, video_ref, course_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...vals, id).id);
            }
          }
        });
        for (const l of oldLessons) if (!keepL.has(l)) db.run('DELETE FROM lessons WHERE id = ?', l);
        for (const s of oldSections) if (!keepS.has(s)) db.run('DELETE FROM sections WHERE id = ?', s);
        db.run('DELETE FROM quiz_questions WHERE course_id = ?', id);
        data.quiz.forEach((q, i) => db.run('INSERT INTO quiz_questions (course_id, position, prompt, options_json, answer) VALUES (?, ?, ?, ?, ?)',
          id, i, q.prompt, JSON.stringify(q.options), q.answer));
        if (course.status === 'published') {
          const p = publishProblems(id);
          if (p.length) throw badRequest(`This course is live, so it must stay complete: ${p.join(' ')}`);
        }
      });
      return full(id);
    },

    setStatus(user, id, status) {
      own(user, id);
      if (status === 'published') {
        const p = publishProblems(id);
        if (p.length) throw badRequest(`Almost there. ${p.join(' ')}`, { problems: p });
      }
      db.run("UPDATE courses SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
      return full(id);
    },
  };
}
