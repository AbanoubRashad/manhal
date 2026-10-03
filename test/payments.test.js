import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, PAYMOB_ENV, learner, newLearner, tick } from './helpers.js';
import { callbackHmac, redirectHmac, classify, HMAC_FIELDS } from '../src/lib/payments.js';

const SECRET = PAYMOB_ENV.PAYMOB_HMAC_SECRET;

/** A mock Paymob API that records calls. */
function paymobMock({ failIntention = false } = {}) {
  const calls = [];
  let orderSeq = 900_000;
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    if (url.endsWith('/v1/intention/')) {
      if (failIntention) return { ok: false, status: 500, json: async () => ({ detail: 'boom' }) };
      return { ok: true, status: 201, json: async () => ({ id: 'pi_test_1', client_secret: 'csk_test_abc', intention_order_id: ++orderSeq, status: 'intended' }) };
    }
    if (url.endsWith('/api/acceptance/void_refund/refund')) return { ok: true, status: 200, json: async () => ({ id: 777, success: true }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, calls };
}

/** Build a Paymob TRANSACTION callback body for an order. */
function txn(paymobOrderId, { id = 5001, amount_cents, success = true, pending = false, is_refunded = false, is_voided = false, message = '' } = {}) {
  return {
    id, pending, amount_cents, success, is_auth: false, is_capture: false, is_standalone_payment: true, is_voided, is_refunded,
    is_3d_secure: true, integration_id: 4567, has_parent_transaction: is_refunded, created_at: '2026-10-01T12:00:00.000000', currency: 'EGP',
    error_occured: false, owner: 1234, order: { id: paymobOrderId, merchant_order_id: null },
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, data: { message },
  };
}
const webhook = (t, obj, hmac = callbackHmac(obj, SECRET)) =>
  t.app.handle({ method: 'POST', path: '/api/payments/paymob/webhook', query: { hmac }, headers: {}, cookies: {}, body: { type: 'TRANSACTION', obj } });

/** Put a paid course in a verified learner's cart and start Paymob checkout. */
async function startCheckout(t, slug = 'machine-learning-foundations') {
  const me = await learner(t);
  const c = t.courseBySlug(slug);
  await t.req('POST', '/api/cart', { as: me, body: { courseId: c.id } });
  const r = await t.req('POST', '/api/checkout', { as: me });
  const order = r.body.orderId ? t.db.get('SELECT * FROM orders WHERE id = ?', r.body.orderId) : undefined;
  return { me, c, r, order };
}

test('HMAC uses the documented field order and verifies callbacks', () => {
  assert.equal(HMAC_FIELDS.length, 20);
  assert.deepEqual(HMAC_FIELDS.slice(0, 3), ['amount_cents', 'created_at', 'currency']);
  const obj = txn(1, { amount_cents: 1000 });
  const t = makeApp({ env: PAYMOB_ENV, seeded: false });
  assert.ok(t.s.paymob.verifyCallback(obj, callbackHmac(obj, SECRET)));
  assert.ok(!t.s.paymob.verifyCallback(obj, 'deadbeef'));
  assert.ok(!t.s.paymob.verifyCallback({ ...obj, amount_cents: 1 }, callbackHmac(obj, SECRET)));
});

test('classify maps Paymob flags to order states', () => {
  assert.equal(classify(txn(1, { success: true })).state, 'paid');
  assert.equal(classify(txn(1, { success: false, pending: true })).state, 'pending');
  assert.equal(classify(txn(1, { success: false, message: 'Do not honour' })).reason, 'Do not honour');
  assert.equal(classify(txn(1, { is_refunded: true })).state, 'refunded');
  assert.equal(classify(txn(1, { is_voided: true })).state, 'refunded');
});

test('checkout creates a Paymob intention with server-side prices and redirects to Unified Checkout', async () => {
  const m = paymobMock();
  const t = makeApp({ env: PAYMOB_ENV, fetch: m.fetch });
  const { r, order, c } = await startCheckout(t);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'redirect');
  assert.equal(r.body.url, 'https://accept.paymob.com/unifiedcheckout/?publicKey=pk_test_x&clientSecret=csk_test_abc');
  const call = m.calls[0];
  assert.equal(call.headers.Authorization, 'Token sk_test_x');
  assert.equal(call.body.amount, c.price * 100);
  assert.equal(call.body.currency, 'EGP');
  assert.deepEqual(call.body.payment_methods, [4567]);
  assert.equal(call.body.notification_url, 'https://manhal.test/api/payments/paymob/webhook');
  assert.match(call.body.special_reference, new RegExp(`^manhal-${order.id}-`));
  assert.equal(order.status, 'pending');
  assert.equal(order.provider_order_id, '900001');
});

test('a paid callback enrolls the learner, credits the instructor and sends a receipt', async () => {
  const m = paymobMock();
  const t = makeApp({ env: PAYMOB_ENV, fetch: m.fetch });
  const { me, c, order } = await startCheckout(t);
  const res = await webhook(t, txn(Number(order.provider_order_id), { amount_cents: order.total * 100 }));
  assert.equal(res.status, 200);
  assert.equal(t.db.get('SELECT status FROM orders WHERE id = ?', order.id).status, 'paid');
  assert.ok(t.db.get('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', me.user.id, c.id));
  const e = t.db.get("SELECT * FROM earnings WHERE order_id = ? AND kind = 'sale'", order.id);
  assert.equal(e.amount, Math.round(order.total * 0.7));
  await tick();
  assert.ok(t.outbox().some(x => x.subject.includes(`receipt #${order.id}`)));
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?', me.user.id).n, 0);
});

test('webhooks are idempotent: a repeated callback changes nothing', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order } = await startCheckout(t);
  const obj = txn(Number(order.provider_order_id), { amount_cents: order.total * 100 });
  await webhook(t, obj);
  const again = await webhook(t, obj);
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(t.db.get("SELECT COUNT(*) AS n FROM earnings WHERE order_id = ?", order.id).n, 1);
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM payment_events').n, 1);
});

test('callbacks with a bad signature are rejected and change nothing', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order } = await startCheckout(t);
  const res = await webhook(t, txn(Number(order.provider_order_id), { amount_cents: order.total * 100 }), 'forged');
  assert.equal(res.status, 403);
  assert.equal(t.db.get('SELECT status FROM orders WHERE id = ?', order.id).status, 'pending');
});

test('pending then paid: the order waits, then completes', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order } = await startCheckout(t);
  const pid = Number(order.provider_order_id);
  await webhook(t, txn(pid, { id: 61, amount_cents: order.total * 100, success: false, pending: true }));
  assert.equal(t.db.get('SELECT status FROM orders WHERE id = ?', order.id).status, 'pending');
  await webhook(t, txn(pid, { id: 61, amount_cents: order.total * 100, success: true }));
  assert.equal(t.db.get('SELECT status FROM orders WHERE id = ?', order.id).status, 'paid');
});

test('a declined payment marks the order failed with the reason, and a retry can still pay it', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order, me, c } = await startCheckout(t);
  const pid = Number(order.provider_order_id);
  await webhook(t, txn(pid, { id: 70, amount_cents: order.total * 100, success: false, message: 'Insufficient funds' }));
  let o = t.db.get('SELECT * FROM orders WHERE id = ?', order.id);
  assert.equal(o.status, 'failed');
  assert.equal(o.failure_reason, 'Insufficient funds');
  assert.ok(!t.db.get('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', me.user.id, c.id));
  await webhook(t, txn(pid, { id: 71, amount_cents: order.total * 100, success: true }));
  o = t.db.get('SELECT * FROM orders WHERE id = ?', order.id);
  assert.equal(o.status, 'paid');
});

test('a refund callback revokes access and reverses instructor earnings', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order, me, c } = await startCheckout(t);
  const pid = Number(order.provider_order_id);
  await webhook(t, txn(pid, { id: 80, amount_cents: order.total * 100 }));
  await webhook(t, txn(pid, { id: 80, amount_cents: order.total * 100, is_refunded: true }));
  assert.equal(t.db.get('SELECT status FROM orders WHERE id = ?', order.id).status, 'refunded');
  assert.ok(!t.db.get('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?', me.user.id, c.id));
  const sum = t.db.get('SELECT SUM(amount) AS s FROM earnings WHERE order_id = ?', order.id).s;
  assert.equal(sum, 0);
  await tick();
  assert.ok(t.outbox().some(x => x.subject.startsWith('Refund for Manhal order')));
});

test('an amount that does not match the order is not fulfilled', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order } = await startCheckout(t);
  const res = await webhook(t, txn(Number(order.provider_order_id), { amount_cents: 100 }));
  assert.equal(res.body.state, 'mismatch');
  assert.equal(t.db.get('SELECT status FROM orders WHERE id = ?', order.id).status, 'pending');
  assert.ok(t.log.lines.some(l => l.msg === 'paymob amount mismatch'));
});

test('callbacks for unknown orders are acknowledged and logged', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const res = await webhook(t, txn(123456789, { amount_cents: 100 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.orderId, null);
});

test('the signed redirect updates the order and sends the learner to it', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const { order } = await startCheckout(t);
  const q = {
    id: '90', pending: 'false', amount_cents: String(order.total * 100), success: 'true', is_auth: 'false', is_capture: 'false',
    is_standalone_payment: 'true', is_voided: 'false', is_refunded: 'false', is_3d_secure: 'true', integration_id: '4567',
    has_parent_transaction: 'false', order: order.provider_order_id, created_at: '2026-10-01T12:00:00', currency: 'EGP',
    error_occured: 'false', owner: '1234', 'source_data.pan': '2346', 'source_data.sub_type': 'MasterCard', 'source_data.type': 'card',
  };
  q.hmac = redirectHmac(q, SECRET);
  const r = await t.app.handle({ method: 'GET', path: '/api/payments/paymob/return', query: q, headers: {}, cookies: {} });
  assert.equal(r.status, 302);
  assert.equal(r.headers.Location, `/orders/${order.id}?payment=paid`);
  const forged = await t.app.handle({ method: 'GET', path: '/api/payments/paymob/return', query: { ...q, hmac: 'x' }, headers: {}, cookies: {} });
  assert.equal(forged.headers.Location, '/orders?payment=unknown');
});

test('when Paymob is down, checkout fails cleanly and nothing is charged', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock({ failIntention: true }).fetch });
  const { r, order } = await startCheckout(t);
  assert.equal(r.status, 502);
  assert.match(r.body.error, /Nothing was charged/);
  assert.equal(order, undefined);
  assert.equal(t.db.get("SELECT status FROM orders ORDER BY id DESC LIMIT 1").status, 'failed');
});

test('paying requires a confirmed email address', async () => {
  const t = makeApp({ env: PAYMOB_ENV, fetch: paymobMock().fetch });
  const me = await newLearner(t);
  await t.req('POST', '/api/cart', { as: me, body: { courseId: t.courseBySlug('sql-for-analysts').id } });
  const r = await t.req('POST', '/api/checkout', { as: me });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'verify_email');
});

test('admin refunds go through the Paymob refund API', async () => {
  const m = paymobMock();
  const t = makeApp({ env: PAYMOB_ENV, fetch: m.fetch });
  const { order } = await startCheckout(t);
  await webhook(t, txn(Number(order.provider_order_id), { id: 4242, amount_cents: order.total * 100 }));
  const adm = await t.login('admin@manhal.test', 'manhal-admin');
  const r = await t.req('POST', `/api/admin/orders/${order.id}/refund`, { as: adm });
  assert.equal(r.status, 200);
  assert.equal(r.body.order.status, 'refunded');
  const call = m.calls.find(c => c.url.endsWith('/refund'));
  assert.deepEqual(call.body, { transaction_id: 4242, amount_cents: order.total * 100 });
});

test('the demo payment provider is refused in production', async () => {
  const t = makeApp({ env: { NODE_ENV: 'production', PAYMENTS_PROVIDER: 'demo' } });
  const me = await learner(t);
  await t.req('POST', '/api/cart', { as: me, body: { courseId: t.courseBySlug('sql-for-analysts').id } });
  const r = await t.req('POST', '/api/checkout', { as: me });
  assert.equal(r.status, 503);
});
