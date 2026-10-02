import { badRequest, notFound, forbidden, HttpError } from '../lib/errors.js';
import { classify, orderIdFromRef } from '../lib/payments.js';

/**
 * Orders and payment state. Status moves: pending -> paid | failed, failed -> paid (retry succeeded),
 * paid -> refunded. Every transition is a guarded UPDATE, so repeated callbacks are harmless.
 */
export function ordersService({ db, config, cart, earnings, mailer, paymob, users, log }) {
  const get = id => db.get('SELECT * FROM orders WHERE id = ?', id);
  const items = id => db.all(`SELECT oi.*, c.slug, c.title_en, c.title_ar FROM order_items oi JOIN courses c ON c.id = oi.course_id
    WHERE oi.order_id = ? ORDER BY c.title_en`, id);

  const shape = o => o && ({
    id: o.id, status: o.status, subtotal: o.subtotal, discount: o.discount, total: o.total, coupon: o.coupon_code,
    provider: o.provider, createdAt: o.created_at, paidAt: o.paid_at, refundedAt: o.refunded_at, failureReason: o.failure_reason,
    items: items(o.id).map(i => ({ courseId: i.course_id, slug: i.slug, title: { en: i.title_en, ar: i.title_ar || i.title_en }, price: i.price, paid: i.paid })),
  });

  async function sendReceipt(orderId) {
    const o = get(orderId), u = users.byId(o.user_id);
    const lang = u.lang === 'ar' ? 'ar' : 'en';
    await mailer.send('receipt', u.email, {
      order: o,
      items: items(orderId).map(i => ({ title: lang === 'ar' ? (i.title_ar || i.title_en) : i.title_en, price: i.paid })),
      date: new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      url: `${config.baseUrl}/learning`,
    }, lang);
  }

  /** Mark paid, enroll, credit instructors. Returns true only for the call that made the change. */
  function fulfill(orderId, txnId = null) {
    const changed = db.tx(() => {
      const { changes } = db.run(`UPDATE orders SET status = 'paid', paid_at = datetime('now'), updated_at = datetime('now'),
        failure_reason = NULL, provider_txn_id = COALESCE(?, provider_txn_id) WHERE id = ? AND status IN ('pending','failed')`, txnId, orderId);
      if (!changes) return false;
      const o = get(orderId);
      const its = db.all('SELECT course_id FROM order_items WHERE order_id = ?', orderId);
      for (const it of its) {
        db.run(`INSERT OR IGNORE INTO enrollments (user_id, course_id, source, order_id) VALUES (?, ?, 'order', ?)`, o.user_id, it.course_id, orderId);
      }
      if (o.coupon_code) db.run('UPDATE coupons SET uses = uses + 1 WHERE code = ?', o.coupon_code);
      cart.clear(o.user_id, its.map(i => i.course_id));
      earnings.recordSale(orderId);
      return true;
    });
    if (changed) {
      log?.info('order paid', { orderId });
      sendReceipt(orderId).catch(() => {});
    }
    return changed;
  }

  function fail(orderId, reason) {
    const { changes } = db.run(`UPDATE orders SET status = 'failed', failure_reason = ?, updated_at = datetime('now')
      WHERE id = ? AND status = 'pending'`, reason || 'Payment was declined.', orderId);
    if (changes) log?.info('order failed', { orderId });
    return changes > 0;
  }

  /** Refund: revoke access to the order's courses and reverse instructor earnings. */
  function markRefunded(orderId) {
    const changed = db.tx(() => {
      const { changes } = db.run(`UPDATE orders SET status = 'refunded', refunded_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND status = 'paid'`, orderId);
      if (!changes) return false;
      db.run('DELETE FROM enrollments WHERE order_id = ?', orderId);
      earnings.recordRefund(orderId);
      return true;
    });
    if (changed) {
      log?.info('order refunded', { orderId });
      const o = get(orderId), u = users.byId(o.user_id);
      mailer.send('refund', u.email, { order: o }, u.lang).catch(() => {});
    }
    return changed;
  }

  return {
    get, shape, fulfill, fail, markRefunded,
    listForUser: userId => db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', userId).map(shape),
    view(id, user) {
      const o = get(id);
      if (!o) throw notFound("We couldn't find that order.");
      if (o.user_id !== user.id && user.role !== 'admin') throw forbidden();
      return shape(o);
    },

    /** Turn the cart into an order. Returns { status: 'paid' | 'redirect', orderId, url? }. */
    async checkout(user) {
      const c = cart.view(user.id);
      if (!c.items.length) throw badRequest('Your cart is empty.');
      const provider = c.total === 0 ? 'free' : config.payments.provider;
      if (provider === 'demo' && config.production) throw new HttpError(503, "Payments aren't set up yet. Please try again later.");
      if (provider === 'paymob') {
        if (!paymob?.configured) throw new HttpError(503, "Payments aren't set up yet. Please try again later.");
        if (!user.email_verified_at) throw badRequest('Please confirm your email address before paying, so we can send your receipt.', { code: 'verify_email' });
      }
      const orderId = db.tx(() => {
        const { id } = db.run(`INSERT INTO orders (user_id, status, subtotal, discount, total, coupon_code, provider, updated_at)
          VALUES (?, 'pending', ?, ?, ?, ?, ?, datetime('now'))`, user.id, c.subtotal, c.discount, c.total, c.coupon?.code ?? null, provider);
        for (const it of c.items) {
          db.run('INSERT INTO order_items (order_id, course_id, instructor_id, price, paid) VALUES (?, ?, ?, ?, ?)', id, it.id, it.instructor.id, it.price, it.paid);
        }
        return id;
      });
      log?.info('order created', { orderId, provider, total: c.total });

      if (provider !== 'paymob') {
        fulfill(orderId);
        return { status: 'paid', orderId };
      }
      try {
        const intent = await paymob.createIntention({
          order: get(orderId),
          items: c.items.map(i => ({ title: i.title.en, paid: i.paid })),
          user,
          notificationUrl: `${config.baseUrl}/api/payments/paymob/webhook`,
          redirectionUrl: `${config.baseUrl}/api/payments/paymob/return`,
        });
        db.run('UPDATE orders SET provider_order_id = ? WHERE id = ?', intent.providerOrderId, orderId);
        return { status: 'redirect', orderId, url: intent.checkoutUrl };
      } catch (err) {
        log?.error('paymob intention failed', { orderId, err });
        fail(orderId, 'Could not start the payment.');
        throw new HttpError(502, "We couldn't reach the payment provider. Nothing was charged. Please try again in a minute.");
      }
    },

    /**
     * Apply a Paymob transaction (already HMAC-verified). Idempotent: each (transaction, state)
     * pair is recorded once in payment_events, inside the same transaction as its effects.
     */
    applyTransaction(obj) {
      const t = classify(obj);
      return db.tx(() => {
        let order = t.providerOrderId ? db.get("SELECT * FROM orders WHERE provider = 'paymob' AND provider_order_id = ?", t.providerOrderId) : null;
        if (!order) { const id = orderIdFromRef(t.merchantRef); if (id) order = get(id); }
        const key = `${t.txnId}:${t.state}`;
        const ins = db.run("INSERT OR IGNORE INTO payment_events (provider, event_key, order_id, outcome) VALUES ('paymob', ?, ?, 'received')", key, order?.id ?? null);
        if (!ins.changes) return { duplicate: true, state: t.state, orderId: order?.id ?? null };
        const outcome = o => db.run("UPDATE payment_events SET outcome = ? WHERE provider = 'paymob' AND event_key = ?", o, key);
        if (!order) { outcome('unknown-order'); log?.warn('paymob callback for unknown order', { txn: t.txnId }); return { state: t.state, orderId: null }; }

        if (t.state === 'paid') {
          if (t.amountCents !== order.total * 100) {
            outcome('amount-mismatch');
            log?.error('paymob amount mismatch', { orderId: order.id, expected: order.total * 100, got: t.amountCents });
            return { state: 'mismatch', orderId: order.id };
          }
          outcome(fulfill(order.id, t.txnId) ? 'fulfilled' : 'already-paid');
        } else if (t.state === 'pending') {
          db.run('UPDATE orders SET provider_txn_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND status = \'pending\'', t.txnId, order.id);
          outcome('pending');
        } else if (t.state === 'failed') {
          outcome(fail(order.id, t.reason) ? 'failed' : 'ignored');
        } else if (t.state === 'refunded') {
          outcome(markRefunded(order.id) ? 'refunded' : 'ignored');
        }
        return { state: t.state, orderId: order.id };
      });
    },

    /** Admin refund. Paymob orders are refunded through the API first; demo orders locally. */
    async refund(orderId) {
      const o = get(orderId);
      if (!o) throw notFound("We couldn't find that order.");
      if (o.status !== 'paid') throw badRequest(`Only paid orders can be refunded. This one is ${o.status}.`);
      if (o.provider === 'paymob') {
        if (!o.provider_txn_id) throw badRequest('This order has no Paymob transaction to refund.');
        try { await paymob.refund(o.provider_txn_id, o.total * 100); } catch (err) {
          log?.error('paymob refund failed', { orderId, err });
          throw new HttpError(502, 'Paymob did not accept the refund. Check the transaction in the Paymob dashboard.');
        }
      }
      markRefunded(orderId);
      return shape(get(orderId));
    },
  };
}
