import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, newLearner, learner } from './helpers.js';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations/index.js';
import { tokensService } from '../src/services/tokens.js';

test('register sends a verification email and confirming it verifies the account', async () => {
  const t = makeApp();
  const me = await newLearner(t, 'new@example.com');
  assert.equal(me.user.emailVerified, false);
  const mail = t.outbox().find(m => m.to === 'new@example.com');
  assert.match(mail.subject, /Confirm your email/);
  const r = await t.req('POST', '/api/auth/verify', { body: { token: t.linkToken(mail) } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.emailVerified, true);
});

test('verification links are single-use', async () => {
  const t = makeApp();
  await newLearner(t, 'once@example.com');
  const token = t.linkToken(t.outbox()[0]);
  assert.equal((await t.req('POST', '/api/auth/verify', { body: { token } })).status, 200);
  const again = await t.req('POST', '/api/auth/verify', { body: { token } });
  assert.equal(again.status, 400);
  assert.match(again.body.error, /invalid or has expired/);
});

test('a new reset token voids the previous one', async () => {
  const t = makeApp();
  await t.req('POST', '/api/auth/forgot', { body: { email: 'learner@manhal.test' } });
  await t.req('POST', '/api/auth/forgot', { body: { email: 'learner@manhal.test' } });
  const [newest, older] = t.outbox().filter(m => m.subject.includes('Reset'));
  const r1 = await t.req('POST', '/api/auth/reset', { body: { token: t.linkToken(older), password: 'brand-new-pass' } });
  assert.equal(r1.status, 400);
  const r2 = await t.req('POST', '/api/auth/reset', { body: { token: t.linkToken(newest), password: 'brand-new-pass' } });
  assert.equal(r2.status, 200);
});

test('reset tokens expire after an hour', () => {
  const db = openDb(':memory:');
  migrate(db);
  db.run("INSERT INTO users (email, name, password_hash) VALUES ('a@b.co', 'A', 'x')");
  let now = new Date('2026-01-01T10:00:00Z');
  const tokens = tokensService({ db, now: () => now });
  const token = tokens.issue(1, 'reset');
  now = new Date('2026-01-01T11:00:01Z');
  assert.throws(() => tokens.consume(token, 'reset'), /expired/);
});

test('password reset changes the password and signs out every session', async () => {
  const t = makeApp();
  const session = await learner(t);
  await t.req('POST', '/api/auth/forgot', { body: { email: 'learner@manhal.test' } });
  const mail = t.outbox().find(m => m.subject.includes('Reset'));
  assert.ok(mail.text.includes('https://manhal.test/reset-password?token='));
  await t.req('POST', '/api/auth/reset', { body: { token: t.linkToken(mail), password: 'a-new-password' } });
  assert.equal((await t.req('GET', '/api/learning', { as: session })).status, 401);
  assert.equal((await t.req('POST', '/api/auth/login', { body: { email: 'learner@manhal.test', password: 'manhal-learn' } })).status, 401);
  assert.equal((await t.req('POST', '/api/auth/login', { body: { email: 'learner@manhal.test', password: 'a-new-password' } })).status, 200);
});

test('forgot password does not reveal whether an email is registered', async () => {
  const t = makeApp();
  const r = await t.req('POST', '/api/auth/forgot', { body: { email: 'nobody@example.com' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { sent: true });
  assert.equal(t.outbox().length, 0);
});

test('reset tokens cannot be used to verify email and vice versa', async () => {
  const t = makeApp();
  await t.req('POST', '/api/auth/forgot', { body: { email: 'learner@manhal.test' } });
  const r = await t.req('POST', '/api/auth/verify', { body: { token: t.linkToken(t.outbox()[0]) } });
  assert.equal(r.status, 400);
});

test('sign-in errors and validation are in plain language', async () => {
  const t = makeApp();
  const bad = await t.req('POST', '/api/auth/login', { body: { email: 'learner@manhal.test', password: 'wrong' } });
  assert.equal(bad.status, 401);
  assert.match(bad.body.error, /don't match/);
  const short = await t.req('POST', '/api/auth/register', { body: { name: 'A B', email: 'x@example.com', password: 'short' } });
  assert.equal(short.status, 400);
  assert.equal(short.body.fields.password, 'Password must be at least 8 characters.');
  const dup = await t.req('POST', '/api/auth/register', { body: { name: 'Dup', email: 'LEARNER@manhal.test', password: 'password123' } });
  assert.equal(dup.status, 409);
});

test('unsafe requests need the CSRF token, and cross-site origins are blocked', async () => {
  const t = makeApp();
  const s = await learner(t);
  const noToken = await t.app.handle({ method: 'POST', path: '/api/wishlist/1', headers: {}, cookies: { sid: s.sid }, query: {} });
  assert.equal(noToken.status, 403);
  const anon = await t.app.handle({ method: 'POST', path: '/api/auth/login', headers: {}, cookies: {}, query: {}, body: { email: 'a@b.co', password: 'x' } });
  assert.equal(anon.status, 403);
  const cross = await t.req('POST', '/api/wishlist/1', { as: s, headers: { origin: 'https://evil.example', host: 'manhal.test' } });
  assert.equal(cross.status, 403);
  const ok = await t.req('POST', '/api/wishlist/1', { as: s, headers: { origin: 'https://manhal.test', host: 'manhal.test' } });
  assert.equal(ok.status, 200);
});

test('login is rate limited per email', async () => {
  const t = makeApp();
  let last;
  for (let i = 0; i < 21; i++) last = await t.req('POST', '/api/auth/login', { body: { email: 'learner@manhal.test', password: 'nope-nope' } });
  assert.equal(last.status, 429);
});

test('changing password keeps the current session and ends the others', async () => {
  const t = makeApp();
  const a = await learner(t), b = await learner(t);
  const r = await t.req('POST', '/api/account/password', { as: a, body: { current: 'manhal-learn', next: 'another-pass-1' } });
  assert.equal(r.status, 200);
  assert.equal((await t.req('GET', '/api/learning', { as: a })).status, 200);
  assert.equal((await t.req('GET', '/api/learning', { as: b })).status, 401);
});

test('logs never contain tokens or passwords', async () => {
  const t = makeApp();
  await newLearner(t, 'logs@example.com');
  await t.req('POST', '/api/auth/forgot', { body: { email: 'logs@example.com' } });
  const all = JSON.stringify(t.log.lines);
  assert.ok(!all.includes('token='));
  assert.ok(!all.includes('password123'));
});
