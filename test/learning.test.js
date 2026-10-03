import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, learner, newLearner } from './helpers.js';
import { parseVideoUrl, bunnySignedUrl } from '../src/lib/video.js';
import { sha256 } from '../src/lib/crypto.js';

const BUNNY = { BUNNY_LIBRARY_ID: '12345', BUNNY_TOKEN_KEY: 'bunny-secret', VIDEO_URL_TTL: '600' };
const GUID = '0b5c3a2e-1111-4a5b-9c9d-123456789abc';

test('video links: YouTube, Vimeo and mp4 work; others are refused', () => {
  assert.equal(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
  assert.equal(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ').kind, 'youtube');
  assert.equal(parseVideoUrl('https://vimeo.com/76979871').src, 'https://player.vimeo.com/video/76979871');
  assert.equal(parseVideoUrl('https://cdn.example.com/a/lesson.mp4').type, 'file');
  assert.equal(parseVideoUrl('javascript:alert(1)'), null);
  assert.equal(parseVideoUrl('https://example.com/page'), null);
});

test('Bunny URLs are signed with SHA256(key + video id + expiry)', () => {
  const now = Date.UTC(2026, 9, 1);
  const s = bunnySignedUrl({ libraryId: '12345', tokenKey: 'k', videoId: GUID, ttl: 600, now });
  const expires = now / 1000 + 600;
  assert.equal(s.expires, expires);
  assert.ok(s.src.startsWith(`https://iframe.mediadelivery.net/embed/12345/${GUID}?token=${sha256('k' + GUID + expires)}&expires=${expires}`));
});

test('only enrolled learners get signed Bunny URLs', async () => {
  const t = makeApp({ env: BUNNY });
  const c = t.courseBySlug('python-for-data-analysis');
  const lesson = t.db.get('SELECT id FROM lessons WHERE course_id = ? AND is_preview = 0 LIMIT 1', c.id);
  t.db.run("UPDATE lessons SET video_provider = 'bunny', video_ref = ? WHERE id = ?", GUID, lesson.id);
  const enrolled = await learner(t);
  const r = await t.req('GET', `/api/lessons/${lesson.id}/play`, { as: enrolled });
  assert.equal(r.body.video.kind, 'bunny');
  assert.match(r.body.video.src, /token=[0-9a-f]{64}&expires=\d+/);
  const stranger = await newLearner(t);
  assert.equal((await t.req('GET', `/api/lessons/${lesson.id}/play`, { as: stranger })).status, 403);
  assert.equal((await t.req('GET', `/api/lessons/${lesson.id}/play`)).status, 403);
});

test('preview lessons and plain links play for anyone; Bunny without keys says so', async () => {
  const t = makeApp();
  const c = t.courseBySlug('python-for-data-analysis');
  const preview = t.db.get('SELECT id FROM lessons WHERE course_id = ? AND is_preview = 1', c.id);
  t.db.run("UPDATE lessons SET video_url = 'https://youtu.be/dQw4w9WgXcQ' WHERE id = ?", preview.id);
  assert.equal((await t.req('GET', `/api/lessons/${preview.id}/play`)).body.video.kind, 'youtube');
  t.db.run("UPDATE lessons SET video_provider = 'bunny', video_ref = ? WHERE id = ?", GUID, preview.id);
  assert.equal((await t.req('GET', `/api/lessons/${preview.id}/play`)).body.video.type, 'unavailable');
});

test('progress, notes, quiz and certificate', async () => {
  const t = makeApp();
  const me = await newLearner(t);
  const c = t.courseBySlug('project-management-fundamentals');
  await t.req('POST', `/api/courses/${c.id}/enroll`, { as: me });
  const lessons = t.db.all('SELECT id FROM lessons WHERE course_id = ? ORDER BY position', c.id);
  let cert = await t.req('POST', `/api/courses/${c.id}/certificate`, { as: me, body: {} });
  assert.equal(cert.status, 409);
  for (const l of lessons) await t.req('POST', `/api/lessons/${l.id}/complete`, { as: me });
  await t.req('PUT', `/api/lessons/${lessons[0].id}/note`, { as: me, body: { body: 'Scope first.' } });
  assert.equal((await t.req('GET', `/api/lessons/${lessons[0].id}/note`, { as: me })).body.body, 'Scope first.');
  const quiz = (await t.req('GET', `/api/courses/${c.id}/quiz`, { as: me })).body;
  assert.equal(quiz.questions.length, 3);
  assert.ok(!('answer' in quiz.questions[0]));
  const fail = await t.req('POST', `/api/courses/${c.id}/quiz`, { as: me, body: { answers: [3, 3, 3] } });
  assert.equal(fail.body.passed, false);
  const pass = await t.req('POST', `/api/courses/${c.id}/quiz`, { as: me, body: { answers: fail.body.answers } });
  assert.equal(pass.body.passed, true);
  assert.equal(pass.body.progress.percent, 100);
  cert = await t.req('POST', `/api/courses/${c.id}/certificate`, { as: me, body: { name: 'Nour Hassan' } });
  assert.equal(cert.status, 200);
  const code = cert.body.certificate.code;
  assert.match(code, /^MNL-[A-Z0-9]{4}-[A-Z0-9]{6}$/);
  const pub = await t.req('GET', `/api/certificates/${code}`);
  assert.equal(pub.body.certificate.name, 'Nour Hassan');
  assert.equal((await t.req('GET', '/api/certificates/MNL-0000-000000')).status, 404);
});

test('learners cannot complete lessons or read quizzes for courses they are not in', async () => {
  const t = makeApp();
  const me = await newLearner(t);
  const c = t.courseBySlug('machine-learning-foundations');
  const l = t.db.get('SELECT id FROM lessons WHERE course_id = ?', c.id);
  assert.equal((await t.req('POST', `/api/lessons/${l.id}/complete`, { as: me })).status, 403);
  assert.equal((await t.req('GET', `/api/courses/${c.id}/quiz`, { as: me })).status, 403);
  assert.equal((await t.req('GET', `/api/learn/${c.slug}`, { as: me })).status, 403);
});

test('the dashboard reports streak, weekly minutes and progress', async () => {
  const t = makeApp();
  const d = (await t.req('GET', '/api/learning', { as: await learner(t) })).body;
  assert.equal(d.courses.length, 3);
  assert.equal(d.week.length, 7);
  assert.equal(d.heat.length, 84);
  assert.ok(d.stats.streak >= 5);
  assert.equal(d.stats.completed, 1);
});
