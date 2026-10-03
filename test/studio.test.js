import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, instructor, admin, learner } from './helpers.js';

const lesson = (title, extra = {}) => ({ title_en: title, minutes: 12, ...extra });

test('instructors create, fill in and publish a course', async () => {
  const t = makeApp();
  const inst = await instructor(t);
  const created = await t.req('POST', '/api/studio/courses', { as: inst, body: { title_en: 'Statistics for Analysts', category: 'data', level: 'int', price: 499 } });
  assert.equal(created.status, 201);
  const c = created.body.course;
  assert.equal(c.slug, 'statistics-for-analysts');
  assert.equal(c.status, 'draft');
  const early = await t.req('POST', `/api/studio/courses/${c.id}/status`, { as: inst, body: { status: 'published' } });
  assert.equal(early.status, 400);
  assert.ok(early.body.problems.includes('Add at least one lesson.'));
  const saved = await t.req('PUT', `/api/studio/courses/${c.id}`, { as: inst, body: {
    title_en: 'Statistics for Analysts', title_ar: 'الإحصاء للمحللين', summary_en: 'Averages, spread and tests.', category: 'data', level: 'int', price: 499,
    sections: [{ title_en: 'Basics', lessons: [lesson('Mean and median', { is_preview: true, video_url: 'https://youtu.be/dQw4w9WgXcQ' }), lesson('Spread')] }],
    quiz: [{ prompt: 'Median of 1, 2, 9?', options: ['2', '4'], answer: 0 }],
  } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.course.problems, []);
  const pub = await t.req('POST', `/api/studio/courses/${c.id}/status`, { as: inst, body: { status: 'published' } });
  assert.equal(pub.body.course.status, 'published');
  assert.equal((await t.req('GET', '/api/courses/statistics-for-analysts')).status, 200);
});

test('saving keeps lesson ids so learner progress survives edits', async () => {
  const t = makeApp();
  const inst = await instructor(t);
  const c = t.courseBySlug('sql-for-analysts');
  const full = (await t.req('GET', `/api/studio/courses/${c.id}`, { as: inst })).body.course;
  const firstId = full.sections[0].lessons[0].id;
  // move the first section to the end and rename a lesson
  full.sections.push(full.sections.shift());
  full.sections[3].lessons[0].title_en = 'SELECT, WHERE and friends';
  const r = await t.req('PUT', `/api/studio/courses/${c.id}`, { as: inst, body: full });
  assert.equal(r.status, 200);
  const moved = r.body.course.sections[3].lessons[0];
  assert.equal(moved.id, firstId);
  assert.equal(moved.title_en, 'SELECT, WHERE and friends');
});

test('invalid video sources are rejected with a clear message', async () => {
  const t = makeApp();
  const inst = await instructor(t);
  const c = t.courseBySlug('sql-for-analysts');
  const full = (await t.req('GET', `/api/studio/courses/${c.id}`, { as: inst })).body.course;
  full.sections[0].lessons[0].video_url = 'https://example.com/not-a-video';
  let r = await t.req('PUT', `/api/studio/courses/${c.id}`, { as: inst, body: full });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Section 1, lesson 1: use a YouTube, Vimeo or direct \.mp4 link/);
  full.sections[0].lessons[0] = { ...full.sections[0].lessons[0], video_url: '', video_provider: 'bunny', video_ref: 'nope' };
  r = await t.req('PUT', `/api/studio/courses/${c.id}`, { as: inst, body: full });
  assert.match(r.body.error, /Bunny Stream video ID/);
});

test('a live course cannot be emptied', async () => {
  const t = makeApp();
  const inst = await instructor(t);
  const c = t.courseBySlug('sql-for-analysts');
  const full = (await t.req('GET', `/api/studio/courses/${c.id}`, { as: inst })).body.course;
  const r = await t.req('PUT', `/api/studio/courses/${c.id}`, { as: inst, body: { ...full, quiz: [] } });
  assert.equal(r.status, 400);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM quiz_questions WHERE course_id = ?', c.id).n, 3);
});

test('instructors can only edit their own courses; admins can edit any', async () => {
  const t = makeApp();
  const other = t.courseBySlug('brand-identity-design');
  assert.equal((await t.req('GET', `/api/studio/courses/${other.id}`, { as: await instructor(t) })).status, 403);
  assert.equal((await t.req('GET', `/api/studio/courses/${other.id}`, { as: await admin(t) })).status, 200);
  assert.equal((await t.req('GET', '/api/studio/courses', { as: await learner(t) })).status, 403);
});

test('admins manage roles, course status, coupons and applications', async () => {
  const t = makeApp();
  const adm = await admin(t);
  const users = (await t.req('GET', '/api/admin/users?q=learner', { as: adm })).body.users;
  const u = users.find(x => x.email === 'learner@manhal.test');
  assert.equal((await t.req('PATCH', `/api/admin/users/${u.id}`, { as: adm, body: { role: 'instructor' } })).body.user.role, 'instructor');
  assert.equal((await t.req('PATCH', `/api/admin/users/${adm.user.id}`, { as: adm, body: { role: 'learner' } })).status, 400);
  const c = t.courseBySlug('sql-for-analysts');
  await t.req('PATCH', `/api/admin/courses/${c.id}`, { as: adm, body: { status: 'archived' } });
  assert.equal((await t.req('GET', '/api/courses/sql-for-analysts')).status, 404);
  const cp = await t.req('POST', '/api/admin/coupons', { as: adm, body: { code: 'ramadan', percent: 30, maxUses: 50, expiresAt: '2030-01-01' } });
  assert.ok(cp.body.coupons.some(x => x.code === 'RAMADAN' && x.percent === 30));
  assert.equal((await t.req('POST', '/api/admin/coupons', { as: adm, body: { code: 'bad code!', percent: 30 } })).status, 400);
  const apps = (await t.req('GET', '/api/admin/applications', { as: adm })).body.applications;
  assert.equal((await t.req('PATCH', `/api/admin/applications/${apps[0].id}`, { as: adm, body: { status: 'contacted' } })).body.applications[0].status, 'contacted');
});

test('the teach application form validates input', async () => {
  const t = makeApp();
  assert.equal((await t.req('POST', '/api/applications', { body: { name: 'Hana', email: 'nope', topic: 'Design' } })).status, 400);
  assert.equal((await t.req('POST', '/api/applications', { body: { name: 'Hana', email: 'hana@example.com', topic: 'Design' } })).status, 201);
});
