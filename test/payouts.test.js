import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, instructor, admin, learner, newLearner } from './helpers.js';

test('the default revenue share is 70% and admins can change it for new sales', async () => {
  const t = makeApp();
  const adm = await admin(t);
  assert.equal((await t.req('GET', '/api/admin/settings', { as: adm })).body.revenueShare, 0.7);
  assert.equal((await t.req('PUT', '/api/admin/settings', { as: adm, body: { revenueShare: 0.8 } })).body.revenueShare, 0.8);
  assert.equal((await t.req('PUT', '/api/admin/settings', { as: adm, body: { revenueShare: 2 } })).status, 400);
  const me = await newLearner(t);
  const c = t.courseBySlug('sql-for-analysts');
  await t.req('POST', '/api/cart', { as: me, body: { courseId: c.id } });
  const { orderId } = (await t.req('POST', '/api/checkout', { as: me })).body;
  assert.equal(t.db.get('SELECT amount FROM earnings WHERE order_id = ?', orderId).amount, Math.round(c.price * 0.8));
  const older = t.db.get('SELECT share FROM earnings WHERE order_id = 1');
  assert.equal(older.share, 0.7);
});

test('instructors see their ledger and balance', async () => {
  const t = makeApp();
  const d = (await t.req('GET', '/api/studio/earnings', { as: await instructor(t) })).body;
  assert.ok(d.ledger.length > 0);
  assert.equal(d.balance.earned, d.ledger.reduce((a, e) => a + e.amount, 0));
  assert.equal(d.balance.available, d.balance.earned - 1000);
  assert.equal(d.share, 0.7);
});

test('payout requests are limited to the available balance', async () => {
  const t = makeApp();
  const inst = await instructor(t);
  const { balance } = (await t.req('GET', '/api/studio/earnings', { as: inst })).body;
  const tooMuch = await t.req('POST', '/api/studio/payouts', { as: inst, body: { amount: balance.available + 1, method: 'instapay', details: 'salma@instapay' } });
  assert.equal(tooMuch.status, 400);
  const tooLittle = await t.req('POST', '/api/studio/payouts', { as: inst, body: { amount: 50, method: 'instapay', details: 'salma@instapay' } });
  assert.match(tooLittle.body.error, /minimum payout/);
  const ok = await t.req('POST', '/api/studio/payouts', { as: inst, body: { amount: 500, method: 'bank', details: 'CIB 1234' } });
  assert.equal(ok.status, 201);
  const after = (await t.req('GET', '/api/studio/earnings', { as: inst })).body.balance;
  assert.equal(after.available, balance.available - 500);
  assert.equal(after.requested, 500);
});

test('admins mark payouts paid or rejected, once', async () => {
  const t = makeApp();
  const inst = await instructor(t), adm = await admin(t);
  const { payout } = (await t.req('POST', '/api/studio/payouts', { as: inst, body: { amount: 300, method: 'wallet', details: '01000000000' } })).body;
  const list = (await t.req('GET', '/api/admin/payouts?status=requested', { as: adm })).body.payouts;
  assert.equal(list[0].id, payout.id);
  const paid = await t.req('POST', `/api/admin/payouts/${payout.id}`, { as: adm, body: { action: 'paid', note: 'Sent via wallet' } });
  assert.equal(paid.body.payout.status, 'paid');
  const again = await t.req('POST', `/api/admin/payouts/${payout.id}`, { as: adm, body: { action: 'rejected' } });
  assert.equal(again.status, 409);
  const b = (await t.req('GET', '/api/studio/earnings', { as: inst })).body.balance;
  assert.equal(b.paidOut, 1300);
  const second = (await t.req('POST', '/api/studio/payouts', { as: inst, body: { amount: 200, method: 'wallet', details: '01000000000' } })).body.payout;
  await t.req('POST', `/api/admin/payouts/${second.id}`, { as: adm, body: { action: 'rejected', note: 'Wrong number' } });
  assert.equal((await t.req('GET', '/api/studio/earnings', { as: inst })).body.balance.requested, 0);
});

test('learners cannot use studio or admin payout routes', async () => {
  const t = makeApp();
  const me = await learner(t);
  assert.equal((await t.req('GET', '/api/studio/earnings', { as: me })).status, 403);
  assert.equal((await t.req('POST', '/api/studio/payouts', { as: me, body: { amount: 100, method: 'bank', details: 'x' } })).status, 403);
  assert.equal((await t.req('GET', '/api/admin/payouts', { as: await instructor(t) })).status, 403);
  assert.equal((await t.req('GET', '/api/admin/payouts')).status, 401);
});
