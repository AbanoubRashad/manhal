import { validate, id } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';

export default function adminRoutes(r, s) {
  const { db, admin, orders, earnings } = s;
  const a = { auth: 'admin' };

  r.get('/api/admin/overview', () => admin.overview(), a);

  r.get('/api/admin/users', ctx => ({ users: admin.users(String(ctx.query.q || '').slice(0, 100)) }), a);
  r.patch('/api/admin/users/:id', ctx => {
    const { role } = validate(ctx.body, { role: { type: 'string', label: 'Role', required: true, oneOf: ['learner', 'instructor', 'admin'] } });
    return { user: admin.setRole(ctx.user, id(ctx.params.id, 'user'), role) };
  }, a);

  r.get('/api/admin/courses', () => ({ courses: admin.courses() }), a);
  r.patch('/api/admin/courses/:id', ctx => {
    const { status } = validate(ctx.body, { status: { type: 'string', label: 'Status', required: true, oneOf: ['draft', 'published', 'archived'] } });
    const cid = id(ctx.params.id, 'course');
    if (!db.run("UPDATE courses SET status = ?, updated_at = datetime('now') WHERE id = ?", status, cid).changes) throw notFound("We couldn't find that course.");
    return { courses: admin.courses() };
  }, a);

  r.get('/api/admin/orders', ctx => {
    const { status } = validate(ctx.query, { status: { type: 'string', label: 'Status', oneOf: ['pending', 'paid', 'failed', 'refunded'] } });
    return { orders: admin.orders(status) };
  }, a);
  r.get('/api/admin/orders/:id', ctx => ({ order: orders.view(id(ctx.params.id, 'order'), ctx.user) }), a);
  r.post('/api/admin/orders/:id/refund', async ctx => ({ order: await orders.refund(id(ctx.params.id, 'order')) }), a);

  r.get('/api/admin/coupons', () => ({ coupons: admin.coupons() }), a);
  r.post('/api/admin/coupons', ctx => {
    const body = validate(ctx.body, {
      code: { type: 'string', label: 'Code', required: true, min: 3, max: 30, pattern: /^[A-Za-z0-9_-]+$/, patternMessage: 'Use letters, numbers, dashes and underscores only.' },
      percent: { type: 'int', label: 'Discount', required: true, min: 1, max: 100 },
      maxUses: { type: 'int', label: 'Maximum uses', min: 1, max: 1_000_000 },
      expiresAt: { type: 'string', label: 'Expiry date', pattern: /^\d{4}-\d{2}-\d{2}$/, patternMessage: 'Use a date like 2026-12-31.' },
      active: { type: 'bool', default: true },
    });
    return { coupons: admin.saveCoupon(body) };
  }, a);
  r.delete('/api/admin/coupons/:code', ctx => ({ coupons: admin.deleteCoupon(ctx.params.code) }), a);

  r.get('/api/admin/payouts', ctx => {
    const { status } = validate(ctx.query, { status: { type: 'string', label: 'Status', oneOf: ['requested', 'paid', 'rejected'] } });
    return { payouts: earnings.listPayouts(status) };
  }, a);
  r.post('/api/admin/payouts/:id', ctx => {
    const body = validate(ctx.body, {
      action: { type: 'string', label: 'Action', required: true, oneOf: ['paid', 'rejected'] },
      note: { type: 'string', label: 'Note', max: 300, default: '' },
    });
    return { payout: earnings.decide(id(ctx.params.id, 'payout'), body.action, body.note) };
  }, a);

  r.get('/api/admin/settings', () => ({ revenueShare: earnings.share() }), a);
  r.put('/api/admin/settings', ctx => {
    const { revenueShare } = validate(ctx.body, { revenueShare: { type: 'number', label: 'Instructor share', required: true, min: 0.1, max: 0.95 } });
    return { revenueShare: earnings.setShare(Math.round(revenueShare * 100) / 100) };
  }, a);

  r.get('/api/admin/applications', () => ({ applications: admin.applications() }), a);
  r.patch('/api/admin/applications/:id', ctx => {
    const { status } = validate(ctx.body, { status: { type: 'string', label: 'Status', required: true, oneOf: ['new', 'contacted', 'approved', 'declined'] } });
    return { applications: admin.setApplication(id(ctx.params.id, 'application'), status) };
  }, a);
}
