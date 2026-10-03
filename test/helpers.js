import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations/index.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { loadConfig } from '../src/config.js';
import { memoryLogger } from '../src/lib/log.js';

export const PAYMOB_ENV = {
  PAYMENTS_PROVIDER: 'paymob', PAYMOB_SECRET_KEY: 'sk_test_x', PAYMOB_PUBLIC_KEY: 'pk_test_x',
  PAYMOB_HMAC_SECRET: 'hmac_test_secret', PAYMOB_INTEGRATION_IDS: '4567',
};

/** A fresh in-memory app. `env` overrides config; `fetch` mocks outgoing HTTP. */
export function makeApp({ env = {}, fetch, seeded = true } = {}) {
  const db = openDb(':memory:');
  const log = memoryLogger();
  migrate(db);
  const config = loadConfig({ BASE_URL: 'https://manhal.test', ...env });
  const app = createApp({ db, config, log, fetch });
  if (seeded) seed(app.services);
  const s = app.services;

  /** Make a request. Pass `as` (a session from login()) to act as a user. */
  async function req(method, path, { body, as, headers = {}, query } = {}) {
    const h = { 'x-requested-with': 'manhal', ...headers };
    if (as) h['x-csrf-token'] = as.csrf;
    const [p, qs] = path.split('?');
    return app.handle({
      method, path: p, body, headers: h, cookies: as ? { sid: as.sid } : {},
      query: query || Object.fromEntries(new URLSearchParams(qs || '')), ip: '127.0.0.1',
    });
  }
  async function login(email, password) {
    const r = await req('POST', '/api/auth/login', { body: { email, password } });
    if (r.status !== 200) throw new Error(`login failed: ${r.body.error}`);
    return { sid: /sid=([^;]+)/.exec(r.headers['Set-Cookie'])[1], csrf: r.body.csrf, user: r.body.user };
  }
  const outbox = () => s.mailer.provider.outbox || [];
  const linkToken = msg => /token=([\w-]+)/.exec(msg.text)[1];
  const courseBySlug = slug => db.get('SELECT * FROM courses WHERE slug = ?', slug);
  return { app, s, db, log, config, req, login, outbox, linkToken, courseBySlug };
}

export const learner = t => t.login('learner@manhal.test', 'manhal-learn');
export const instructor = t => t.login('salma@manhal.test', 'manhal-teach');
export const admin = t => t.login('admin@manhal.test', 'manhal-admin');

/** Register a brand-new learner and sign them in. */
export async function newLearner(t, email = `l${Math.random().toString(36).slice(2, 8)}@example.com`) {
  const r = await t.req('POST', '/api/auth/register', { body: { name: 'Test Learner', email, password: 'password123' } });
  return { sid: /sid=([^;]+)/.exec(r.headers['Set-Cookie'])[1], csrf: r.body.csrf, user: r.body.user };
}

export const tick = () => new Promise(r => setTimeout(r, 0));
