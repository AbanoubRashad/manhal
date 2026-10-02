import { queryToTransaction } from '../lib/payments.js';
import { forbidden } from '../lib/errors.js';

export default function paymentRoutes(r, s) {
  const { orders, paymob, log } = s;

  /**
   * Paymob "transaction processed" callback. Signed with HMAC-SHA512 in ?hmac=.
   * Always answer 200 for valid signatures (even duplicates) so Paymob stops retrying.
   */
  r.post('/api/payments/paymob/webhook', ctx => {
    const body = ctx.body || {};
    if (body.type && body.type !== 'TRANSACTION') return { ignored: true };
    const obj = body.obj;
    if (!paymob?.configured || !obj || !paymob.verifyCallback(obj, ctx.query.hmac)) {
      log.warn('paymob callback rejected: bad signature');
      throw forbidden('Invalid signature.');
    }
    const result = orders.applyTransaction(obj);
    return { received: true, ...result };
  }, { csrf: false });

  /** The learner lands here after Unified Checkout. Signed too, so it can update the order if the callback is late. */
  r.get('/api/payments/paymob/return', ctx => {
    const q = ctx.query;
    if (!paymob?.configured || !paymob.verifyRedirect(q)) return { redirect: '/orders?payment=unknown' };
    const res = orders.applyTransaction(queryToTransaction(q));
    const state = res.state === 'mismatch' ? 'failed' : res.state;
    return { redirect: res.orderId ? `/orders/${res.orderId}?payment=${state}` : '/orders?payment=unknown' };
  });
}
