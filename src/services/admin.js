import { notFound, badRequest, conflict } from '../lib/errors.js';
import { publicUser } from './users.js';

export function adminService({ db, catalog, earnings }) {
  return {
    overview() {
      const n = sql => db.get(sql).n;
      const months = db.all(`SELECT substr(paid_at,1,7) AS month, SUM(total) AS revenue, COUNT(*) AS orders FROM orders
        WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 6`).reverse();
      return {
        users: n('SELECT COUNT(*) AS n FROM users'),
        instructors: n("SELECT COUNT(*) AS n FROM users WHERE role = 'instructor'"),
        published: n("SELECT COUNT(*) AS n FROM courses WHERE status = 'published'"),
        drafts: n("SELECT COUNT(*) AS n FROM courses WHERE status = 'draft'"),
        enrollments: n('SELECT COUNT(*) AS n FROM enrollments'),
        revenue: n("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status = 'paid'"),
        refunded: n("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status = 'refunded'"),
        payoutsWaiting: n("SELECT COUNT(*) AS n FROM payouts WHERE status = 'requested'"),
        applications: n("SELECT COUNT(*) AS n FROM applications WHERE status = 'new'"),
        share: earnings.share(),
        months,
      };
    },
    users(q = '') {
      const like = `%${q}%`;
      return db.all(`SELECT u.*, (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollments,
        (SELECT COUNT(*) FROM courses c WHERE c.instructor_id = u.id) AS courses
        FROM users u WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.id DESC LIMIT 200`, like, like)
        .map(u => ({ ...publicUser(u), enrollments: u.enrollments, courses: u.courses }));
    },
    setRole(actor, userId, role) {
      const u = db.get('SELECT * FROM users WHERE id = ?', userId);
      if (!u) throw notFound("We couldn't find that user.");
      if (u.id === actor.id && role !== 'admin') throw badRequest("You can't remove your own admin access.");
      if (u.role === 'instructor' && role === 'learner' && db.get('SELECT 1 FROM courses WHERE instructor_id = ?', userId)) {
        throw conflict('This instructor still owns courses. Archive or reassign them first.');
      }
      db.run('UPDATE users SET role = ? WHERE id = ?', role, userId);
      return publicUser(db.get('SELECT * FROM users WHERE id = ?', userId));
    },
    courses() {
      return db.all('SELECT id FROM courses ORDER BY updated_at DESC, id DESC').map(r => catalog.cardById(r.id));
    },
    orders(status) {
      return db.all(`SELECT o.*, u.email, u.name FROM orders o JOIN users u ON u.id = o.user_id
        ${status ? 'WHERE o.status = ?' : ''} ORDER BY o.id DESC LIMIT 300`, ...(status ? [status] : []))
        .map(o => ({ id: o.id, status: o.status, total: o.total, discount: o.discount, coupon: o.coupon_code, provider: o.provider,
          createdAt: o.created_at, paidAt: o.paid_at, failureReason: o.failure_reason, user: { id: o.user_id, name: o.name, email: o.email },
          items: db.get('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?', o.id).n }));
    },
    coupons: () => db.all('SELECT * FROM coupons ORDER BY created_at DESC').map(c => ({
      code: c.code, percent: c.percent, active: Boolean(c.active), maxUses: c.max_uses, uses: c.uses, expiresAt: c.expires_at })),
    saveCoupon({ code, percent, maxUses, expiresAt, active }) {
      db.run(`INSERT INTO coupons (code, percent, max_uses, expires_at, active) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET percent = excluded.percent, max_uses = excluded.max_uses, expires_at = excluded.expires_at, active = excluded.active`,
        code.toUpperCase(), percent, maxUses ?? null, expiresAt ? `${expiresAt} 23:59:59` : null, active === false ? 0 : 1);
      return this.coupons();
    },
    deleteCoupon(code) {
      const c = db.get('SELECT * FROM coupons WHERE code = ?', code);
      if (!c) throw notFound("We couldn't find that coupon.");
      // Used coupons are deactivated rather than deleted so order history stays readable.
      if (c.uses > 0) db.run('UPDATE coupons SET active = 0 WHERE code = ?', code);
      else db.run('DELETE FROM coupons WHERE code = ?', code);
      return this.coupons();
    },
    applications: () => db.all('SELECT * FROM applications ORDER BY id DESC LIMIT 200'),
    setApplication(id, status) {
      if (!db.run('UPDATE applications SET status = ? WHERE id = ?', status, id).changes) throw notFound("We couldn't find that application.");
      return this.applications();
    },
  };
}
