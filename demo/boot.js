// Browser-only backend for the static demo (Firebase Hosting).
// Runs the real Manhal server code (routes, services, migrations, seed) against
// SQLite-in-WebAssembly and stores the database in this browser's localStorage.
import { wrapSqlJs } from './db.js';
import { migrate } from '../server/migrations/index.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { createLogger } from '../server/lib/log.js';

const DB_KEY = 'manhal-demo-db-v1', SID_KEY = 'manhal-demo-sid', MAIL_KEY = 'manhal-demo-outbox';
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* full or blocked: the demo keeps working in memory */ } },
};
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** Console email provider whose outbox survives page loads, so emailed links can be opened. */
function demoMailProvider() {
  let outbox = [];
  try { outbox = JSON.parse(store.get(MAIL_KEY)) || []; } catch { /* empty */ }
  return {
    name: 'console',
    outbox,
    async send(msg) {
      outbox.unshift({ ...msg, id: Date.now() + Math.random(), sentAt: new Date().toISOString() });
      outbox.length = Math.min(outbox.length, 20);
      store.set(MAIL_KEY, JSON.stringify(outbox));
    },
  };
}

const ready = (async () => {
  const SQL = await window.initSqlJs({ locateFile: f => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${f}` });
  const saved = store.get(DB_KEY);
  let raw;
  try { raw = saved ? new SQL.Database(fromB64(saved)) : new SQL.Database(); } catch { raw = new SQL.Database(); }
  const db = wrapSqlJs(raw);
  const log = createLogger({ level: 'warn', write: line => console.warn(line) });
  migrate(db, log);
  const config = {
    production: false, demo: true, baseUrl: location.origin, seedDemo: true, logLevel: 'warn',
    email: { provider: 'console', from: 'Manhal <hello@manhal.demo>', resendKey: '' },
    payments: { provider: 'demo', paymob: { baseUrl: '', secretKey: '', publicKey: '', hmacSecret: '', integrationIds: [] } },
    video: { bunnyLibraryId: '', bunnyTokenKey: '', ttl: 7200 },
  };
  const app = createApp({ db, config, log, provider: demoMailProvider() });
  seed(app.services);
  let timer;
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => store.set(DB_KEY, toB64(db.export())), 250); };
  persist();
  return { app, persist };
})();

window.__manhalDemo = {
  async request(method, path, body, headers) {
    const { app, persist } = await ready;
    const url = new URL(path, location.origin);
    const sid = store.get(SID_KEY);
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const res = await app.handle({
      method, path: url.pathname, query: Object.fromEntries(url.searchParams), body,
      headers: { ...lower, host: location.host }, cookies: sid ? { sid } : {}, ip: 'browser',
    });
    const cookie = res.headers['Set-Cookie'];
    if (cookie) {
      const m = /^sid=([^;]*);.*Max-Age=(\d+)/.exec(cookie);
      if (m) store.set(SID_KEY, m[2] === '0' ? '' : m[1]);
    }
    persist();
    // Round-trip through JSON like a real response, so the UI never shares objects with the "server".
    return { status: res.status, body: res.body == null ? null : JSON.parse(JSON.stringify(res.body)) };
  },
  /** Start over with a fresh demo database. */
  reset() {
    [DB_KEY, SID_KEY, MAIL_KEY].forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
    location.reload();
  },
};
