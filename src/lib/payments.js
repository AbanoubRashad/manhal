import { hmacSha512, safeEqual } from './crypto.js';

/*
 * Paymob Accept client (Egypt), following the current Intention API + Unified Checkout flow:
 *   1. POST {base}/v1/intention/  (Authorization: Token <secret key>) with amount in cents,
 *      currency, payment_methods (integration ids), items, billing_data, special_reference,
 *      notification_url and redirection_url. The response has client_secret and intention_order_id.
 *   2. Redirect the learner to {base}/unifiedcheckout/?publicKey=<public key>&clientSecret=<client_secret>
 *   3. Paymob POSTs a "TRANSACTION" callback to notification_url (?hmac=...) and redirects the
 *      learner to redirection_url with the same fields as query parameters (also signed).
 * The legacy three-step flow (auth/tokens -> ecommerce/orders -> acceptance/payment_keys + iframe)
 * is deprecated, so this module no longer uses it.
 */

/** Fields Paymob concatenates (in this order) to sign a transaction callback with HMAC-SHA512. */
export const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
  'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
  'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
  'source_data.type', 'success',
];

const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const str = v => (v === undefined || v === null ? '' : typeof v === 'boolean' ? String(v) : String(v));

/** HMAC for the JSON body of a POST callback (`obj` is body.obj). */
export const callbackHmac = (obj, secret) => hmacSha512(secret, HMAC_FIELDS.map(f => str(pick(obj, f))).join(''));

/** HMAC for the redirect query string, where order.id arrives as `order`. */
export function redirectHmac(query, secret) {
  const v = f => (f === 'order.id' ? query.order : query[f]);
  return hmacSha512(secret, HMAC_FIELDS.map(f => str(v(f))).join(''));
}

/** Convert the flat redirect query into the same shape as a callback obj. */
export function queryToTransaction(q) {
  const b = v => v === 'true';
  return {
    id: Number(q.id), pending: b(q.pending), success: b(q.success), amount_cents: Number(q.amount_cents),
    is_refunded: b(q.is_refunded), is_voided: b(q.is_voided), is_refund: b(q.is_refund),
    currency: q.currency, error_occured: b(q.error_occured),
    order: { id: Number(q.order), merchant_order_id: q.merchant_order_id },
    data: { message: q['data.message'] || q.txn_response_code || '' },
  };
}

/**
 * Classify a transaction into what we do with the order.
 * Returns { state: 'paid'|'pending'|'failed'|'refunded', txnId, providerOrderId, merchantRef, amountCents, reason }.
 */
export function classify(obj) {
  let state;
  if (obj.is_refunded || obj.is_refund || obj.is_voided || obj.is_void) state = 'refunded';
  else if (obj.pending) state = 'pending';
  else if (obj.success) state = 'paid';
  else state = 'failed';
  return {
    state,
    txnId: String(obj.id ?? ''),
    providerOrderId: obj.order?.id != null ? String(obj.order.id) : '',
    merchantRef: obj.order?.merchant_order_id || obj.special_reference || '',
    amountCents: Number(obj.amount_cents) || 0,
    reason: state === 'failed' ? String(obj.data?.message || obj.data?.txn_response_code || 'Declined').slice(0, 200) : '',
  };
}

export const merchantRef = orderId => `manhal-${orderId}`;
export const orderIdFromRef = ref => { const m = /^manhal-(\d+)/.exec(String(ref || '')); return m ? Number(m[1]) : null; };

export function createPaymob(cfg, { fetch = globalThis.fetch } = {}) {
  const call = async (path, body) => {
    const res = await fetch(cfg.baseUrl + path, {
      method: 'POST',
      headers: { Authorization: `Token ${cfg.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    if (!res.ok) {
      const detail = data && (data.detail || data.message || JSON.stringify(data).slice(0, 200));
      const err = new Error(`Paymob ${path} responded ${res.status}${detail ? `: ${detail}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return data;
  };
  return {
    configured: Boolean(cfg.secretKey && cfg.publicKey && cfg.hmacSecret && cfg.integrationIds.length),

    /** Create a payment intention and return { checkoutUrl, intentionId, providerOrderId }. */
    async createIntention({ order, items, user, notificationUrl, redirectionUrl }) {
      const [first, ...rest] = String(user.name || 'Manhal Learner').trim().split(/\s+/);
      const data = await call('/v1/intention/', {
        amount: order.total * 100,
        currency: 'EGP',
        payment_methods: cfg.integrationIds,
        items: items.map(i => ({ name: i.title.slice(0, 50), amount: i.paid * 100, description: i.title.slice(0, 255), quantity: 1 })),
        billing_data: {
          first_name: first || 'Learner', last_name: rest.join(' ') || 'NA', email: user.email,
          // Paymob requires these fields; digital goods have no address, so "NA" is the documented placeholder.
          phone_number: user.phone || 'NA', street: 'NA', building: 'NA', floor: 'NA', apartment: 'NA',
          city: 'NA', country: 'EG',
        },
        special_reference: `${merchantRef(order.id)}-${Date.now()}`,
        notification_url: notificationUrl,
        redirection_url: redirectionUrl,
      });
      if (!data?.client_secret) throw new Error('Paymob did not return a client_secret.');
      return {
        intentionId: data.id,
        providerOrderId: data.intention_order_id != null ? String(data.intention_order_id) : '',
        checkoutUrl: `${cfg.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(cfg.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`,
      };
    },

    /** Refund a captured transaction (full or partial). The result arrives as a callback too. */
    refund: (transactionId, amountCents) => call('/api/acceptance/void_refund/refund', { transaction_id: Number(transactionId), amount_cents: amountCents }),

    verifyCallback: (obj, hmac) => Boolean(hmac) && safeEqual(callbackHmac(obj, cfg.hmacSecret), String(hmac).toLowerCase()),
    verifyRedirect: query => Boolean(query.hmac) && safeEqual(redirectHmac(query, cfg.hmacSecret), String(query.hmac).toLowerCase()),
  };
}
