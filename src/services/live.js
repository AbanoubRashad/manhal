// Live sessions (with reminders 24 hours and 15 minutes before) and course announcements.
// Reminders are rule-based and never depend on the AI. They respect channel settings,
// are de-duplicated per session, and don't count against the coach's limits.
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { sqlTime, fromSql } from '../lib/time.js';

const MIN = 60_000;

export function liveService({ db, notify, access, catalog, now = () => new Date() }) {
  function own(user, courseId) {
    const c = catalog.row(courseId);
    if (!c) throw notFound("We couldn't find that course.");
    if (!access.teaches(user, c)) throw forbidden('You can only manage your own courses.');
    return c;
  }
  const learners = courseId => db.all('SELECT user_id FROM enrollments WHERE course_id = ?', courseId).map(r => r.user_id);
  const shape = (s, user) => {
    const course = catalog.row(s.course_id);
    const full = access.level(user, course) === 'full';
    return {
      id: s.id, courseId: s.course_id, course: { slug: course.slug, title: { en: course.title_en, ar: course.title_ar || course.title_en } },
      title: s.title, startsAt: fromSql(s.starts_at).toISOString(), minutes: s.minutes,
      // The meeting link is only for learners with access to the course.
      link: full ? s.link : null,
    };
  };
  const upcomingSql = "starts_at > ?";
  const notStarted = () => sqlTime(new Date(now() - 3 * 60 * MIN)); // keep sessions listed while they may still be running

  return {
    forCourse(user, courseId) {
      const course = catalog.row(courseId);
      if (access.level(user, course) === 'none') throw notFound("We couldn't find that course.");
      return db.all(`SELECT * FROM live_sessions WHERE course_id = ? AND ${upcomingSql} ORDER BY starts_at`, courseId, notStarted()).map(s => shape(s, user));
    },
    /** Upcoming sessions across the learner's courses, for the dashboard. */
    forUser(user) {
      return db.all(`SELECT s.* FROM live_sessions s JOIN enrollments e ON e.course_id = s.course_id AND e.user_id = ?
        WHERE s.${upcomingSql} ORDER BY s.starts_at LIMIT 10`, user.id, notStarted()).map(s => shape(s, user));
    },
    create(user, courseId, { title, startsAt, minutes, link }) {
      own(user, courseId);
      const t = new Date(startsAt);
      if (Number.isNaN(t.getTime())) throw badRequest('Choose a valid start time.', { fields: { startsAt: 'Choose a valid start time.' } });
      if (t < now()) throw badRequest('The session must start in the future.', { fields: { startsAt: 'The session must start in the future.' } });
      let url;
      try { url = new URL(link); } catch { /* invalid */ }
      if (!url || url.protocol !== 'https:') throw badRequest('Use an https:// meeting link (Zoom, Google Meet or Teams).', { fields: { link: 'Use an https:// meeting link (Zoom, Google Meet or Teams).' } });
      const { id } = db.run('INSERT INTO live_sessions (course_id, title, starts_at, minutes, link) VALUES (?, ?, ?, ?, ?)', courseId, title, sqlTime(t), minutes, url.href);
      return shape(db.get('SELECT * FROM live_sessions WHERE id = ?', id), user);
    },
    remove(user, id) {
      const s = db.get('SELECT * FROM live_sessions WHERE id = ?', id);
      if (!s) throw notFound("We couldn't find that session.");
      own(user, s.course_id);
      db.run('DELETE FROM live_sessions WHERE id = ?', id);
      return { removed: true };
    },
    listForStudio(user, courseId) {
      own(user, courseId);
      return db.all('SELECT * FROM live_sessions WHERE course_id = ? ORDER BY starts_at DESC LIMIT 50', courseId).map(s => shape(s, user));
    },

    /** Send due reminders. Safe to call as often as you like: each (session, window) goes out once. */
    async remind() {
      const t = now();
      const soon = db.all('SELECT * FROM live_sessions WHERE starts_at > ? AND starts_at <= ?', sqlTime(new Date(t - 5 * MIN)), sqlTime(new Date(t.getTime() + 24 * 60 * MIN)));
      let sent = 0;
      for (const s of soon) {
        const left = (fromSql(s.starts_at) - t) / MIN;
        // The day-before reminder only makes sense while the session is still about a day away.
        const win = left <= 15 ? '15m' : left >= 20 * 60 ? '24h' : null;
        if (!win) continue;
        const course = catalog.row(s.course_id);
        for (const userId of learners(s.course_id)) {
          const id = await notify.push(userId, {
            kind: 'live', key: `live:${s.id}:${win}`,
            title: win === '15m'
              ? { en: `Starting soon: ${s.title}`, ar: `يبدأ قريبًا: ${s.title}` }
              : { en: `Tomorrow: ${s.title}`, ar: `بكرة: ${s.title}` },
            body: win === '15m'
              ? { en: `Your live session for ${course.title_en} starts in about 15 minutes.`, ar: `جلستك المباشرة في ${course.title_ar || course.title_en} تبدأ بعد حوالي 15 دقيقة.` }
              : { en: `Your live session for ${course.title_en} starts in about 24 hours.`, ar: `جلستك المباشرة في ${course.title_ar || course.title_en} تبدأ بعد حوالي 24 ساعة.` },
            link: `/courses/${course.slug}#live`, cta: { en: 'See the session', ar: 'تفاصيل الجلسة' }, email: true,
          });
          if (id) sent++;
        }
      }
      return sent;
    },

    announcements(user, courseId) {
      const course = catalog.row(courseId);
      if (access.level(user, course) !== 'full') return [];
      return db.all('SELECT * FROM announcements WHERE course_id = ? ORDER BY id DESC LIMIT 30', courseId)
        .map(a => ({ id: a.id, title: a.title, body: a.body, createdAt: a.created_at }));
    },
    async announce(user, courseId, { title, body }) {
      const course = own(user, courseId);
      const { id } = db.run('INSERT INTO announcements (course_id, title, body, created_at) VALUES (?, ?, ?, ?)', courseId, title, body, sqlTime(now()));
      for (const userId of learners(courseId)) {
        await notify.push(userId, {
          kind: 'news', key: `news:${id}`, title: { en: `${course.title_en}: ${title}`, ar: `${course.title_ar || course.title_en}: ${title}` },
          body: { en: body.slice(0, 200), ar: body.slice(0, 200) }, link: `/learn/${course.slug}?tab=news`, email: true,
          cta: { en: 'Read it', ar: 'اقرأ الإعلان' },
        });
      }
      return { id };
    },
  };
}
