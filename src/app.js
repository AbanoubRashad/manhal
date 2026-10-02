import { createRouter } from './lib/router.js';
import { HttpError } from './lib/errors.js';
import { createLimiter } from './lib/ratelimit.js';
import { createPaymob } from './lib/payments.js';
import { createVideo } from './lib/video.js';
import { createMailer, createProvider } from './lib/email/index.js';
import { usersService } from './services/users.js';
import { sessionsService } from './services/sessions.js';
import { tokensService } from './services/tokens.js';
import { authService } from './services/auth.js';
import { catalogService } from './services/catalog.js';
import { cartService } from './services/cart.js';
import { earningsService } from './services/earnings.js';
import { ordersService } from './services/orders.js';
import { learningService } from './services/learning.js';
import { studioService } from './services/studio.js';
import { adminService } from './services/admin.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import cartRoutes from './routes/cart.js';
import learningRoutes from './routes/learning.js';
import studioRoutes from './routes/studio.js';
import adminRoutes from './routes/admin.js';
import paymentRoutes from './routes/payments.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ROLE_OK = {
  user: u => Boolean(u),
  instructor: u => u && (u.role === 'instructor' || u.role === 'admin'),
  admin: u => u && u.role === 'admin',
};

/**
 * Build the application: services + API routes behind a transport-agnostic handle().
 * src/server.js adapts it to node:http; demo/boot.js runs the same code in the browser.
 */
export function createApp({ db, config, log, provider, fetch = globalThis.fetch, now = () => new Date() }) {
  const s = { db, config, log, now };
  s.mailer = createMailer({ config, provider: provider || createProvider(config, { log, fetch }), db, log });
  s.paymob = config.payments.provider === 'paymob' ? createPaymob(config.payments.paymob, { fetch }) : null;
  s.video = createVideo(config.video);
  s.limits = {
    auth: createLimiter({ limit: 20, windowMs: 15 * 60_000 }),
    email: createLimiter({ limit: 6, windowMs: 15 * 60_000 }),
  };
  s.users = usersService(s);
  s.sessions = sessionsService(s);
  s.tokens = tokensService(s);
  s.auth = authService(s);
  s.catalog = catalogService(s);
  s.cart = cartService(s);
  s.earnings = earningsService(s);
  s.orders = ordersService(s);
  s.learning = learningService(s);
  s.studio = studioService(s);
  s.admin = adminService(s);

  const router = createRouter();
  for (const register of [authRoutes, catalogRoutes, cartRoutes, learningRoutes, studioRoutes, adminRoutes, paymentRoutes]) register(router, s);

  const secure = config.baseUrl.startsWith('https://');
  const cookie = (value, maxAge) => `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  /**
   * Handle one API request.
   * req: { method, path, query, headers (lower-case keys), cookies, body, ip }
   * returns: { status, headers, body } where body is a JSON-serialisable object.
   */
  async function handle(req) {
    const headers = {};
    const res = (status, body) => ({ status, headers, body });
    const found = router.match(req.method, req.path);
    if (!found.route) {
      if (found.allowed?.length) { headers.Allow = found.allowed.join(', '); return res(405, { error: 'That action is not supported here.' }); }
      return res(404, { error: "We couldn't find that." });
    }
    const { route, params } = found;
    const token = req.cookies?.sid || null;
    const auth = token ? s.sessions.lookup(token) : null;
    const lang = req.headers?.['x-lang'] === 'ar' ? 'ar' : 'en';

    const ctx = {
      method: req.method, path: req.path, params, query: req.query || {}, body: req.body, headers: req.headers || {},
      ip: req.ip || 'local', lang, user: auth?.user || null, session: auth?.session || null, sessionToken: token,
      setSession: t => { headers['Set-Cookie'] = cookie(t, s.sessions.maxAgeSeconds); },
      clearSession: () => { headers['Set-Cookie'] = cookie('', 0); },
    };
    if (token && !auth) ctx.clearSession();

    try {
      if (UNSAFE.has(req.method) && route.csrf !== false) {
        const origin = ctx.headers.origin, host = ctx.headers.host;
        if (origin && host) {
          let originHost = '';
          try { originHost = new URL(origin).host; } catch { /* malformed */ }
          if (originHost !== host) throw new HttpError(403, 'This request came from another site and was blocked.');
        }
        if (ctx.session) {
          if (ctx.headers['x-csrf-token'] !== ctx.session.csrf) throw new HttpError(403, 'Your session has changed. Refresh the page and try again.', { code: 'csrf' });
        } else if (ctx.headers['x-requested-with'] !== 'manhal') {
          throw new HttpError(403, 'This request was blocked. Refresh the page and try again.', { code: 'csrf' });
        }
      }
      if (route.auth && !ROLE_OK[route.auth](ctx.user)) {
        if (!ctx.user) throw new HttpError(401, 'Please sign in to continue.');
        throw new HttpError(403, route.auth === 'admin' ? 'Only admins can do that.' : 'This area is for instructors. Apply to teach from the Teach page.');
      }
      const out = await route.handler(ctx);
      if (out && out.redirect) { headers.Location = out.redirect; return res(302, null); }
      if (out && typeof out.status === 'number' && 'body' in out) return res(out.status, out.body);
      return res(200, out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return res(err.status, { error: err.message, ...err.extra });
      log.error('unhandled error', { path: req.path, method: req.method, err });
      return res(500, { error: 'Something went wrong on our side. Please try again.' });
    }
  }

  return { handle, services: s, router };
}
