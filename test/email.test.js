import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/lib/email/templates.js';
import { resendProvider } from '../src/lib/email/resend.js';
import { createMailer, createProvider } from '../src/lib/email/index.js';
import { loadConfig } from '../src/config.js';
import { memoryLogger } from '../src/lib/log.js';

const order = { id: 7, total: 879, discount: 220, coupon_code: 'MANHAL20' };

test('templates render in English and Arabic with escaped content', () => {
  const en = render('verify', 'en', { name: '<b>Omar</b>', url: 'https://x.test/verify-email?token=abc' });
  assert.match(en.subject, /Confirm your email/);
  assert.ok(en.html.includes('&lt;b&gt;Omar&lt;/b&gt;'));
  assert.ok(en.text.includes('https://x.test/verify-email?token=abc'));
  const ar = render('verify', 'ar', { name: 'عمر', url: 'https://x.test' });
  assert.ok(ar.html.includes('dir="rtl"'));
  assert.match(ar.subject, /أكّد/);
});

test('receipt lists items, discount and total', () => {
  const r = render('receipt', 'en', { order, items: [{ title: 'SQL for Analysts', price: 879 }], date: '1 Oct 2026', url: 'https://x.test/learning' });
  assert.match(r.subject, /#7/);
  assert.match(r.text, /SQL for Analysts: 879 EGP/);
  assert.match(r.text, /Discount: -220 EGP/);
  assert.match(r.text, /Total: 879 EGP/);
});

test('resend provider posts to the API with a bearer key', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: 'em_1' }) }; };
  const p = resendProvider({ apiKey: 're_test', fetch });
  await p.send({ from: 'Manhal <a@b.co>', to: 'x@y.co', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['x@y.co']);
});

test('a failed provider is logged and recorded, not thrown', async () => {
  const log = memoryLogger();
  const fetch = async () => ({ ok: false, status: 422, json: async () => ({ message: 'Invalid from address' }) });
  const config = loadConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test' });
  const mailer = createMailer({ config, provider: createProvider(config, { log, fetch }), log });
  const ok = await mailer.send('reset', 'x@y.co', { name: 'X', url: 'https://x' });
  assert.equal(ok, false);
  const line = log.lines.find(l => l.msg === 'email failed');
  assert.match(line.err.message, /422: Invalid from address/);
});

test('unknown providers and a missing Resend key fail fast', () => {
  assert.throws(() => createProvider(loadConfig({ EMAIL_PROVIDER: 'pigeon' })), /Unknown EMAIL_PROVIDER/);
  assert.throws(() => createProvider(loadConfig({ EMAIL_PROVIDER: 'resend' })), /RESEND_API_KEY/);
});
