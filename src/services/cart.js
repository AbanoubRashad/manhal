import { badRequest, notFound, conflict } from '../lib/errors.js';
import { sqlTime } from '../lib/time.js';

/** Split a discount across items in proportion to price; the last item absorbs rounding. */
export function allocateDiscount(prices, discount) {
  const sub = prices.reduce((a, p) => a + p, 0);
  if (!sub || !discount) return prices.slice();
  let left = discount;
  return prices.map((p, i) => {
    if (i === prices.length - 1) return p - left;
    const d = Math.round(discount * p / sub);
    left -= d;
    return p - d;
  });
}

/** Cart and coupons. Prices always come from the database, never from the client. */
export function cartService({ db, catalog, now = () => new Date() }) {
  function couponProblem(c) {
    if (!c || !c.active) return "That code isn't valid.";
    if (c.expires_at && c.expires_at <= sqlTime(now())) return 'That code has expired.';
    if (c.max_uses != null && c.uses >= c.max_uses) return 'That code has been fully used.';
    return null;
  }
  const findCoupon = code => db.get('SELECT * FROM coupons WHERE code = ?', String(code || '').trim());

  function view(userId) {
    const rows = db.all('SELECT course_id FROM cart_items WHERE user_id = ? ORDER BY created_at, course_id', userId);
    const items = rows.map(r => catalog.cardById(r.course_id)).filter(c => c && c.status === 'published');
    const subtotal = items.reduce((a, c) => a + c.price, 0);
    const applied = db.get('SELECT code FROM cart_coupons WHERE user_id = ?', userId);
    let coupon = null, discount = 0;
    if (applied) {
      const c = findCoupon(applied.code);
      if (couponProblem(c)) db.run('DELETE FROM cart_coupons WHERE user_id = ?', userId);
      else { coupon = { code: c.code, percent: c.percent }; discount = Math.round(subtotal * c.percent / 100); }
    }
    const paid = allocateDiscount(items.map(c => c.price), discount);
    return {
      items: items.map((c, i) => ({ ...c, paid: paid[i] })),
      subtotal, discount, total: subtotal - discount, coupon,
    };
  }

  return {
    view,
    add(userId, courseId) {
      const c = catalog.row(courseId);
      if (!c || c.status !== 'published') throw notFound("We couldn't find that course.");
      if (db.get('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', userId, courseId)) throw conflict("You're already enrolled in this course.");
      if (c.price === 0) throw badRequest('This course is free. Enroll from the course page.');
      db.run('INSERT OR IGNORE INTO cart_items (user_id, course_id) VALUES (?, ?)', userId, courseId);
      return view(userId);
    },
    remove(userId, courseId) {
      db.run('DELETE FROM cart_items WHERE user_id = ? AND course_id = ?', userId, courseId);
      return view(userId);
    },
    applyCoupon(userId, code) {
      const c = findCoupon(code);
      const problem = couponProblem(c);
      if (problem) throw badRequest(problem, { fields: { code: problem } });
      db.run('INSERT INTO cart_coupons (user_id, code) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET code = excluded.code', userId, c.code);
      return view(userId);
    },
    removeCoupon(userId) {
      db.run('DELETE FROM cart_coupons WHERE user_id = ?', userId);
      return view(userId);
    },
    clear(userId, courseIds) {
      for (const id of courseIds) db.run('DELETE FROM cart_items WHERE user_id = ? AND course_id = ?', userId, id);
      if (!db.get('SELECT 1 FROM cart_items WHERE user_id = ?', userId)) db.run('DELETE FROM cart_coupons WHERE user_id = ?', userId);
    },
    count: userId => db.get('SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?', userId).n,
    couponProblem, findCoupon,
  };
}
