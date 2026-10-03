import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { migrate, migrations } from '../src/migrations/index.js';
import { makeApp } from './helpers.js';
import { createServer } from '../src/server.js';
import { metaFor, renderShell, robotsTxt } from '../src/lib/seo.js';
import { redact, memoryLogger } from '../src/lib/log.js';
import { loadConfig, configProblems } from '../src/config.js';
import { validate } from '../src/lib/validate.js';

test('migrations run once and keep existing data', () => {
  const db = openDb(':memory:');
  // A database created by the first release only.
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  migrations[0].up(db);
  db.run("INSERT INTO schema_migrations (version, name) VALUES (1, 'core')");
  db.run("INSERT INTO users (email, name, password_hash) VALUES ('old@example.com', 'Old User', 'x')");
  const applied = migrate(db);
  assert.deepEqual(applied, [2, 3, 4, 5]);
  const u = db.get("SELECT * FROM users WHERE email = 'old@example.com'");
  assert.equal(u.name, 'Old User');
  assert.equal(u.lang, 'en');
  assert.equal(u.email_verified_at, null);
  assert.deepEqual(migrate(db), []);
});

test('structured logs redact secrets', () => {
  assert.deepEqual(redact({ password: 'p', nested: { apiKey: 'k', ok: 1 }, authorization: 'Bearer x' }),
    { password: '[redacted]', nested: { apiKey: '[redacted]', ok: 1 }, authorization: '[redacted]' });
  const log = memoryLogger();
  log.info('hi', { token: 'abc', path: '/x' });
  assert.equal(log.lines[0].token, '[redacted]');
  assert.equal(log.lines[0].level, 'info');
  assert.ok(log.lines[0].ts);
});

test('production refuses unsafe configuration', () => {
  const problems = configProblems(loadConfig({ NODE_ENV: 'production', BASE_URL: 'http://x.test' }));
  assert.ok(problems.some(p => p.includes('EMAIL_PROVIDER=console')));
  assert.ok(problems.some(p => p.includes('PAYMENTS_PROVIDER=demo')));
  assert.ok(problems.some(p => p.includes('https://')));
  const good = loadConfig({ NODE_ENV: 'production', BASE_URL: 'https://manhal.example', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k',
    PAYMENTS_PROVIDER: 'paymob', PAYMOB_SECRET_KEY: 's', PAYMOB_PUBLIC_KEY: 'p', PAYMOB_HMAC_SECRET: 'h', PAYMOB_INTEGRATION_IDS: '1' });
  assert.deepEqual(configProblems(good), []);
});

test('validation cleans input and explains problems', () => {
  const v = validate({ email: '  A@B.CO ', n: '5' }, { email: { type: 'string', email: true, required: true }, n: { type: 'int', min: 1 } });
  assert.deepEqual(v, { email: 'a@b.co', n: 5 });
  assert.throws(() => validate({ n: 'x' }, { n: { type: 'int', label: 'Count' } }), /Count must be a whole number/);
});

test('course pages get server-rendered meta, Open Graph and JSON-LD', () => {
  const meta = metaFor('/courses/sql-for-analysts', { baseUrl: 'https://manhal.test', findCourse: () => ({ title_en: 'SQL for Analysts', summary_en: 'Ask your data <questions>.', price: 399, instructor_name: 'Salma Nour' }) });
  const html = renderShell('<title>x</title><!--meta-->', meta);
  assert.ok(html.includes('<title>SQL for Analysts · Manhal</title>'));
  assert.ok(html.includes('<meta property="og:title" content="SQL for Analysts · Manhal">'));
  assert.ok(html.includes('content="Ask your data &lt;questions&gt;."'));
  assert.ok(html.includes('"@type":"Course"'));
  assert.ok(html.includes('<link rel="canonical" href="https://manhal.test/courses/sql-for-analysts">'));
  assert.equal(metaFor('/courses/missing', { baseUrl: 'https://m.test', findCourse: () => null }).status, 404);
  assert.match(robotsTxt('https://m.test'), /Disallow: \/admin\n[\s\S]*Sitemap: https:\/\/m\.test\/sitemap\.xml/);
});

/* ---------- HTTP server ---------- */
const t = makeApp();
const server = createServer({ app: t.app, config: t.config, log: memoryLogger() });
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test('health check reports status and database', async () => {
  const r = await fetch(`${base}/healthz`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db, true);
});

test('pages carry security headers including the CSP', async () => {
  const r = await fetch(`${base}/`);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('x-request-id'));
});

test('course URLs are server-rendered with their own meta tags', async () => {
  const r = await fetch(`${base}/courses/sql-for-analysts`);
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<title>SQL for Analysts · Manhal<\/title>/);
  assert.equal((await fetch(`${base}/courses/does-not-exist`)).status, 404);
});

test('sitemap.xml lists published courses and robots.txt points to it', async () => {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(xml, /<loc>https:\/\/manhal\.test\/courses\/sql-for-analysts<\/loc>/);
  assert.equal((xml.match(/<url>/g) || []).length, 6 + 14);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/manhal\.test\/sitemap\.xml/);
});

test('the API rejects bad JSON and non-JSON bodies, and serves static files', async () => {
  const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'manhal' }, body: '{nope' });
  assert.equal(bad.status, 400);
  const form = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'a=b' });
  assert.equal(form.status, 415);
  const css = await fetch(`${base}/css/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const traversal = await (await fetch(`${base}/%2e%2e/package.json`)).text();
  assert.ok(!traversal.includes('"name": "manhal"'), 'files outside public/ must not be served');
});

test('a full HTTP sign-in sets an HttpOnly session cookie', async () => {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'manhal' }, body: JSON.stringify({ email: 'learner@manhal.test', password: 'manhal-learn' }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /sid=[\w-]+; Path=\/; HttpOnly; SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie: cookie.split(';')[0] } })).json();
  assert.equal(me.user.email, 'learner@manhal.test');
});
