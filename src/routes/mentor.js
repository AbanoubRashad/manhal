import { validate, id, email } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { validTz } from '../services/coach.js';
import { MODES } from '../services/mentor.js';
import { AI_FEATURES } from '../services/aiAdmin.js';

export default function mentorRoutes(r, s) {
  const { db, config, mentor, notify, coach, live, qa, reports, aiAdmin, access, catalog } = s;
  const user = { auth: 'user' }, inst = { auth: 'instructor' }, admin = { auth: 'admin' };

  /* ---------- Nour tutor ---------- */
  // Streams Server-Sent Events. Every check runs before the first byte, so refusals are plain JSON errors.
  r.post('/api/mentor/ask', ctx => {
    const body = validate(ctx.body, {
      courseId: { type: 'int', label: 'Course', required: true, min: 1 },
      lessonId: { type: 'int', label: 'Lesson', min: 1 },
      text: { type: 'string', label: 'Message', max: config.ai.maxInputChars, default: '' },
      mode: { type: 'string', label: 'Mode', oneOf: MODES, default: 'explain' },
    });
    return { stream: mentor.ask(ctx.user, body, ctx.lang) };
  }, user);
  r.get('/api/mentor/courses/:id', ctx => mentor.get(ctx.user, id(ctx.params.id, 'course')), user);
  r.delete('/api/mentor/courses/:id', ctx => mentor.clear(ctx.user, id(ctx.params.id, 'course')), user);
  r.get('/api/mentor/history', ctx => ({ conversations: mentor.history(ctx.user) }), user);
  r.delete('/api/mentor/history', ctx => mentor.clearAll(ctx.user), user);
  r.post('/api/mentor/messages/:id/rate', ctx => {
    const { value } = validate(ctx.body, { value: { type: 'int', label: 'Rating', required: true, oneOf: [-1, 0, 1] } });
    return mentor.rate(ctx.user, id(ctx.params.id, 'message'), value);
  }, user);
  r.post('/api/mentor/messages/:id/report', ctx => {
    const { reason } = validate(ctx.body, { reason: { type: 'string', label: 'Reason', required: true, max: 500 } });
    return mentor.report(ctx.user, id(ctx.params.id, 'message'), reason);
  }, user);

  /* ---------- mentor settings, parent contact, unsubscribe ---------- */
  const settingsView = u => {
    const m = notify.settings(u.id);
    return {
      coachOn: Boolean(m.coach_on), intensity: m.intensity, emailOn: Boolean(m.email_on), studyTime: m.study_time,
      tz: u.tz, birthYear: u.birth_year ?? null, minor: access.isMinor(u),
      parentEmail: m.parent_email, parentConfirmed: Boolean(m.parent_confirmed_at),
      quota: mentor.quota(u), tutorAvailable: !mentor.inControl(u),
    };
  };
  r.get('/api/mentor/settings', ctx => settingsView(ctx.user), user);
  r.put('/api/mentor/settings', ctx => {
    const b = validate(ctx.body, {
      coachOn: { type: 'bool', label: 'Coach' },
      intensity: { type: 'string', label: 'Intensity', oneOf: ['gentle', 'balanced', 'push'] },
      emailOn: { type: 'bool', label: 'Email' },
      studyTime: { type: 'string', label: 'Study time', oneOf: ['any', 'morning', 'afternoon', 'evening'] },
      birthYear: { type: 'int', label: 'Birth year', min: 1920, max: new Date().getUTCFullYear() - 5 },
    });
    const m = notify.settings(ctx.user.id);
    db.run('UPDATE mentor_settings SET coach_on = ?, intensity = ?, email_on = ?, study_time = ? WHERE user_id = ?',
      b.coachOn ?? m.coach_on, b.intensity ?? m.intensity, b.emailOn ?? m.email_on, b.studyTime ?? m.study_time, ctx.user.id);
    if (b.birthYear !== undefined) db.run('UPDATE users SET birth_year = ? WHERE id = ?', b.birthYear, ctx.user.id);
    return settingsView(db.get('SELECT * FROM users WHERE id = ?', ctx.user.id));
  }, user);
  r.put('/api/mentor/parent', async ctx => {
    const { email: e } = validate(ctx.body, { email: { ...email, required: false } });
    s.limits.email.hit(`parent:${ctx.user.id}`);
    return reports.setParent(ctx.user, e || null);
  }, user);
  r.post('/api/parent/confirm', ctx => {
    const { token } = validate(ctx.body, { token: { type: 'string', label: 'Link', required: true, max: 100 } });
    return reports.confirmParent(token);
  });
  r.post('/api/mentor/unsubscribe', ctx => {
    const b = validate(ctx.body, { u: { type: 'int', label: 'Link', required: true, min: 1 }, s: { type: 'string', label: 'Link', required: true, max: 100 } });
    return coach.unsubscribe(b.u, b.s);
  });
  r.put('/api/account/tz', ctx => {
    const { tz } = validate(ctx.body, { tz: { type: 'string', label: 'Time zone', required: true, max: 64 } });
    if (!validTz(tz)) throw badRequest("That time zone isn't valid.");
    db.run('UPDATE users SET tz = ? WHERE id = ?', tz, ctx.user.id);
    return { tz };
  }, user);

  /* ---------- notifications ---------- */
  r.get('/api/notifications', ctx => notify.list(ctx.user.id), user);
  r.post('/api/notifications/read-all', ctx => notify.readAll(ctx.user.id), user);
  r.post('/api/notifications/:id/open', ctx => notify.open(ctx.user.id, id(ctx.params.id, 'notification')), user);

  /* ---------- live sessions, news, Q&A for learners ---------- */
  r.get('/api/live', ctx => ({ sessions: live.forUser(ctx.user) }), user);
  r.get('/api/courses/:id/live', ctx => ({ sessions: live.forCourse(ctx.user, id(ctx.params.id, 'course')) }));
  r.get('/api/courses/:id/news', ctx => ({ announcements: live.announcements(ctx.user, id(ctx.params.id, 'course')) }), user);
  r.get('/api/courses/:id/questions', ctx => {
    const lessonId = ctx.query.lesson ? id(ctx.query.lesson, 'lesson') : null;
    return { questions: qa.list(ctx.user, id(ctx.params.id, 'course'), lessonId) };
  }, user);
  r.post('/api/courses/:id/questions', async ctx => {
    const b = validate(ctx.body, {
      lessonId: { type: 'int', label: 'Lesson', min: 1 },
      title: { type: 'string', label: 'Question', required: true, min: 5, max: 200 },
      body: { type: 'string', label: 'Details', max: 3000, default: '' },
    });
    s.limits.email.hit(`question:${ctx.user.id}`);
    return { status: 201, body: { question: await qa.ask(ctx.user, { courseId: id(ctx.params.id, 'course'), ...b }) } };
  }, user);

  /* ---------- studio: community inbox, drafts, sessions, news, lesson files ---------- */
  r.get('/api/studio/courses/:id/community', ctx => {
    const cid = id(ctx.params.id, 'course');
    const inbox = qa.inbox(ctx.user, cid);
    const c = catalog.row(cid);
    return { course: { id: c.id, slug: c.slug, title: { en: c.title_en, ar: c.title_ar || c.title_en } }, ...inbox,
      sessions: live.listForStudio(ctx.user, cid), announcements: live.announcements(ctx.user, cid) };
  }, inst);
  r.put('/api/studio/courses/:id/ai-mode', ctx => {
    const { mode } = validate(ctx.body, { mode: { type: 'string', label: 'Mode', required: true, oneOf: ['draft', 'instant'] } });
    return qa.setMode(ctx.user, id(ctx.params.id, 'course'), mode);
  }, inst);
  r.post('/api/studio/questions/:id/answer', async ctx => {
    const b = validate(ctx.body, { body: { type: 'string', label: 'Answer', max: 5000 }, fromDraft: { type: 'bool', default: false } });
    return { question: await qa.answer(ctx.user, id(ctx.params.id, 'question'), b) };
  }, inst);
  r.post('/api/studio/questions/:id/discard', ctx => qa.discardDraft(ctx.user, id(ctx.params.id, 'question')), inst);
  r.post('/api/studio/answers/:id/approve', async ctx => ({ question: await qa.approve(ctx.user, id(ctx.params.id, 'answer')) }), inst);
  r.put('/api/studio/answers/:id', async ctx => {
    const { body } = validate(ctx.body, { body: { type: 'string', label: 'Answer', required: true, max: 5000 } });
    return { question: await qa.correct(ctx.user, id(ctx.params.id, 'answer'), body) };
  }, inst);
  r.delete('/api/studio/answers/:id', ctx => ({ question: qa.remove(ctx.user, id(ctx.params.id, 'answer')) }), inst);
  r.post('/api/studio/courses/:id/live', ctx => {
    const b = validate(ctx.body, {
      title: { type: 'string', label: 'Session title', required: true, min: 3, max: 120 },
      startsAt: { type: 'string', label: 'Start time', required: true, max: 40 },
      minutes: { type: 'int', label: 'Length', min: 10, max: 480, default: 60 },
      link: { type: 'string', label: 'Meeting link', required: true, max: 500 },
    });
    return { status: 201, body: { session: live.create(ctx.user, id(ctx.params.id, 'course'), b) } };
  }, inst);
  r.delete('/api/studio/live/:id', ctx => live.remove(ctx.user, id(ctx.params.id, 'session')), inst);
  r.post('/api/studio/courses/:id/news', async ctx => {
    const b = validate(ctx.body, {
      title: { type: 'string', label: 'Title', required: true, min: 3, max: 120 },
      body: { type: 'string', label: 'Message', required: true, min: 3, max: 3000 },
    });
    return { status: 201, body: await live.announce(ctx.user, id(ctx.params.id, 'course'), b) };
  }, inst);
  r.post('/api/studio/lessons/:id/files', ctx => {
    const b = validate(ctx.body, {
      name: { type: 'string', label: 'File name', required: true, max: 120, pattern: /\.(txt|md|markdown)$/i, patternMessage: 'Attach a .txt or .md file.' },
      text: { type: 'string', label: 'File', required: true, max: 60_000 },
    });
    const lid = id(ctx.params.id, 'lesson');
    const l = db.get('SELECT * FROM lessons WHERE id = ?', lid);
    if (!l || !access.teaches(ctx.user, catalog.row(l.course_id))) throw badRequest("We couldn't find that lesson.");
    db.run('INSERT INTO lesson_files (lesson_id, name, text) VALUES (?, ?, ?)', lid, b.name, b.text);
    s.knowledge.indexLesson(lid);
    return { status: 201, body: { files: db.all('SELECT id, name, length(text) AS size FROM lesson_files WHERE lesson_id = ?', lid) } };
  }, inst);
  r.delete('/api/studio/files/:id', ctx => {
    const f = db.get('SELECT f.*, l.course_id FROM lesson_files f JOIN lessons l ON l.id = f.lesson_id WHERE f.id = ?', id(ctx.params.id, 'file'));
    if (!f || !access.teaches(ctx.user, catalog.row(f.course_id))) throw badRequest("We couldn't find that file.");
    db.run('DELETE FROM lesson_files WHERE id = ?', f.id);
    s.knowledge.indexLesson(f.lesson_id);
    return { removed: true };
  }, inst);

  /* ---------- admin ---------- */
  r.get('/api/admin/ai', () => aiAdmin.overview(), admin);
  r.put('/api/admin/ai/features', ctx => {
    const b = validate(ctx.body, { key: { type: 'string', label: 'Feature', required: true, oneOf: AI_FEATURES }, on: { type: 'bool', label: 'On', required: true } });
    return { features: aiAdmin.setFeature(b.key, b.on) };
  }, admin);
  r.post('/api/admin/ai/flags/:id/resolve', ctx => aiAdmin.resolveFlag(id(ctx.params.id, 'flag')), admin);
}
