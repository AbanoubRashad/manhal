import { validate, email, password } from '../lib/validate.js';
import { publicUser } from '../services/users.js';
import { notFound } from '../lib/errors.js';

const LANG = { type: 'string', label: 'Language', oneOf: ['en', 'ar'] };

export default function authRoutes(r, s) {
  const { config, auth, users, sessions, cart, limits, mailer } = s;

  r.get('/api/me', ctx => ({
    user: publicUser(ctx.user),
    csrf: ctx.session?.csrf ?? null,
    cartCount: ctx.user ? cart.count(ctx.user.id) : 0,
    config: {
      payments: config.payments.provider,
      devMail: mailer.provider.name === 'console' && !config.production,
      demo: Boolean(config.demo),
    },
  }));

  r.post('/api/auth/register', async ctx => {
    limits.auth.hit(`reg:${ctx.ip}`);
    const body = validate(ctx.body, {
      name: { type: 'string', label: 'Name', required: true, min: 2, max: 80 },
      email, password, lang: { ...LANG, default: ctx.lang },
    });
    const { user, token, csrf } = await auth.register(body);
    ctx.setSession(token);
    return { status: 201, body: { user: publicUser(user), csrf } };
  });

  r.post('/api/auth/login', ctx => {
    const body = validate(ctx.body, { email, password: { ...password, min: 1 } });
    limits.auth.hit(`login:${body.email}`);
    const { user, token, csrf } = auth.login(body);
    limits.auth.reset(`login:${body.email}`);
    ctx.setSession(token);
    return { user: publicUser(user), csrf };
  });

  r.post('/api/auth/logout', ctx => {
    sessions.destroy(ctx.sessionToken);
    ctx.clearSession();
    return { ok: true };
  });

  r.post('/api/auth/verify', ctx => {
    const { token } = validate(ctx.body, { token: { type: 'string', label: 'Link', required: true, max: 100 } });
    const user = auth.verifyEmail(token);
    return { user: publicUser(user), verified: true };
  });

  r.post('/api/auth/resend-verification', async ctx => {
    limits.email.hit(`verify:${ctx.user.id}`);
    if (ctx.user.email_verified_at) return { alreadyVerified: true };
    await auth.sendVerification(ctx.user);
    return { sent: true };
  }, { auth: 'user' });

  r.post('/api/auth/forgot', async ctx => {
    const body = validate(ctx.body, { email });
    limits.email.hit(`forgot:${body.email}`);
    limits.auth.hit(`forgot-ip:${ctx.ip}`);
    await auth.forgot(body.email);
    return { sent: true };
  });

  r.post('/api/auth/reset', ctx => {
    const body = validate(ctx.body, { token: { type: 'string', label: 'Link', required: true, max: 100 }, password });
    auth.reset(body.token, body.password);
    ctx.clearSession();
    return { reset: true };
  });

  r.patch('/api/account', ctx => {
    const body = validate(ctx.body, {
      name: { type: 'string', label: 'Name', min: 2, max: 80 },
      lang: LANG,
      headline: { type: 'string', label: 'Headline', max: 80, default: undefined },
      bio: { type: 'string', label: 'Bio', max: 1200 },
    });
    return { user: publicUser(users.updateProfile(ctx.user.id, body)) };
  }, { auth: 'user' });

  r.post('/api/account/password', ctx => {
    const body = validate(ctx.body, { current: { ...password, label: 'Current password', min: 1 }, next: { ...password, label: 'New password' } });
    limits.auth.hit(`pw:${ctx.user.id}`);
    users.changePassword(ctx.user.id, body.current, body.next);
    sessions.destroyAll(ctx.user.id, ctx.sessionToken);
    return { changed: true };
  }, { auth: 'user' });

  // Development mailbox for the console email provider. Never available in production.
  r.get('/api/dev/outbox', () => {
    if (config.production || mailer.provider.name !== 'console') throw notFound();
    return { emails: mailer.provider.outbox.map(m => ({ id: m.id, to: m.to, subject: m.subject, html: m.html, text: m.text, sentAt: m.sentAt })) };
  });
}
