import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomToken } from './lib/crypto.js';
import { loadConfig, configProblems } from './config.js';
import { createLogger } from './lib/log.js';
import { openDb } from './db.js';
import { migrate } from './migrations/index.js';
import { createApp } from './app.js';
import { seed } from './seed.js';
import { metaFor, renderShell, sitemapXml, robotsTxt } from './lib/seo.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC = join(ROOT, 'public');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const MAX_BODY = 200_000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://iframe.mediadelivery.net',
  "media-src 'self' https:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const parseCookies = h => Object.fromEntries(String(h || '').split(';').map(p => p.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { fail(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

/** Wrap the app in an HTTP server. Exported so tests can start it on a random port. */
export function createServer({ app, config, log, publicDir = PUBLIC }) {
  const { db } = app.services;
  const shell = () => readFileSync(join(publicDir, 'index.html'), 'utf8');
  const findCourse = slug => db.get(`SELECT c.*, u.name AS instructor_name FROM courses c JOIN users u ON u.id = c.instructor_id
    WHERE c.slug = ? AND c.status = 'published'`, slug);
  const started = Date.now();

  return http.createServer(async (req, res) => {
    const t0 = process.hrtime.bigint();
    const reqId = randomToken(6);
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { ...SECURITY_HEADERS, 'X-Request-Id': reqId, ...headers });
      res.end(body);
    };
    res.on('finish', () => {
      // Path only: query strings can carry tokens and signatures.
      log.info('request', { reqId, method: req.method, path, status: res.statusCode, ms: Number((process.hrtime.bigint() - t0) / 1000n) / 1000 });
    });

    try {
      if (path === '/healthz') {
        let dbOk = true;
        try { db.get('SELECT 1 AS ok'); } catch { dbOk = false; }
        return send(dbOk ? 200 : 503, JSON.stringify({ status: dbOk ? 'ok' : 'degraded', db: dbOk, version: VERSION, uptime: Math.round((Date.now() - started) / 1000) }),
          { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      }
      if (path === '/robots.txt') return send(200, robotsTxt(config.baseUrl), { 'Content-Type': TYPES['.txt'] });
      if (path === '/sitemap.xml') {
        const courses = db.all("SELECT slug, updated_at FROM courses WHERE status = 'published' ORDER BY id");
        return send(200, sitemapXml(config.baseUrl, courses), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      }

      if (path.startsWith('/api/')) {
        let body;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const raw = await readBody(req);
          if (raw) {
            if (!String(req.headers['content-type'] || '').includes('application/json')) return send(415, JSON.stringify({ error: 'Send JSON.' }), { 'Content-Type': 'application/json' });
            try { body = JSON.parse(raw); } catch { return send(400, JSON.stringify({ error: "That request wasn't valid JSON." }), { 'Content-Type': 'application/json' }); }
          }
        }
        const out = await app.handle({
          method: req.method, path, query: Object.fromEntries(url.searchParams), body,
          headers: req.headers, cookies: parseCookies(req.headers.cookie),
          ip: req.socket.remoteAddress,
        });
        return send(out.status, out.body == null ? '' : JSON.stringify(out.body), {
          'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...out.headers,
        });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed', { Allow: 'GET' });

      // Static files
      const file = normalize(join(publicDir, decodeURIComponent(path)));
      if (file.startsWith(publicDir) && path !== '/' && existsSync(file) && statSync(file).isFile()) {
        const ext = extname(file);
        res.writeHead(200, {
          ...SECURITY_HEADERS, 'X-Request-Id': reqId,
          'Content-Type': TYPES[ext] || 'application/octet-stream',
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
        });
        return createReadStream(file).pipe(res);
      }

      // Single-page app shell with server-rendered meta tags.
      const meta = metaFor(path, { baseUrl: config.baseUrl, findCourse });
      return send(meta.status || 200, renderShell(shell(), meta), { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
    } catch (err) {
      if (err.status === 413) return send(413, JSON.stringify({ error: 'That request is too large.' }), { 'Content-Type': 'application/json' });
      log.error('server error', { reqId, path, err });
      if (!res.headersSent) send(500, JSON.stringify({ error: 'Something went wrong on our side. Please try again.' }), { 'Content-Type': 'application/json' });
    }
  });
}

/** Boot: config, database, migrations, optional demo seed, HTTP server. */
export function start(env = process.env) {
  const config = loadConfig(env);
  const log = createLogger({ level: config.logLevel, base: { service: 'manhal' } });
  const problems = configProblems(config);
  if (problems.length) {
    problems.forEach(p => log.error('config problem', { problem: p }));
    process.exit(1);
  }
  const db = openDb(config.databasePath);
  migrate(db, log);
  const app = createApp({ db, config, log });
  if (config.seedDemo && seed(app.services)) log.info('seeded demo data', { accounts: 'see README' });

  const server = createServer({ app, config, log });
  server.listen(config.port, () => log.info('listening', { url: config.baseUrl, port: config.port, version: VERSION, payments: config.payments.provider, email: config.email.provider }));
  const purge = setInterval(() => app.services.sessions.purgeExpired(), 6 * 3600_000).unref();
  const stop = signal => {
    log.info('shutting down', { signal });
    clearInterval(purge);
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return { server, app, config };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
