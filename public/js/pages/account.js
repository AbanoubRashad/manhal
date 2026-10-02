import { store, t, esc, money, L, date, fmt, savePrefs, applyLang } from '../state.js';
import { get, patch, post } from '../api.js';
import { ic } from '../icons.js';
import { app, $, bindForm, okMsg, field, footer, loading, errorView, requireUser, badge, renderHeader } from '../ui.js';
import { current, render } from '../router.js';

export function accountPage() {
  if (!requireUser()) return;
  const me = store.me;
  app().innerHTML = `<section class="wrap"><div class="dash-head"><div><div class="eyebrow">${esc(me.email)}</div><h1>${t('account_title')}</h1>
    <p class="muted">${me.emailVerified ? `${ic('check', 'sm')} ${t('email_verified')}` : t('email_unverified')}</p></div></div>
  <div class="acct-grid sec">
    <form class="box" id="pf" novalidate><h2>${t('profile')}</h2>
      ${field('name', t('name'), `value="${esc(me.name)}" required maxlength="80" autocomplete="name"`)}
      <div class="field"><label for="f-lang">${t('email_lang')}</label><select id="f-lang" name="lang"><option value="en" ${me.lang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${me.lang === 'ar' ? 'selected' : ''}>العربية</option></select></div>
      ${me.role !== 'learner' ? `${field('headline', t('headline'), `value="${esc(me.headline)}" maxlength="80"`)}
      <div class="field"><label for="f-bio">${t('bio')}</label><textarea id="f-bio" name="bio" rows="4" maxlength="1200">${esc(me.bio)}</textarea></div>` : ''}
      <div class="form-msg"></div><button class="btn btn-brand" type="submit" style="margin-top:16px">${t('save')}</button></form>
    <form class="box" id="cf" novalidate><h2>${t('change_pw')}</h2>
      ${field('current', t('current_pw'), 'type="password" autocomplete="current-password" required')}
      ${field('next', t('new_password'), 'type="password" autocomplete="new-password" required minlength="8"', t('pw_hint'))}
      <div class="form-msg"></div><button class="btn btn-brand" type="submit" style="margin-top:16px">${t('change_pw')}</button>
      <p style="margin-top:14px"><a href="/forgot-password" style="color:var(--brand);font-weight:600;font-size:.9rem">${t('forgot_link')}</a></p></form>
  </div></section>${footer()}`;
  bindForm($('#pf'), async (v, form) => {
    const { user } = await patch('/api/account', v);
    store.me = user;
    if (user.lang !== store.lang) { store.lang = user.lang; savePrefs(); applyLang(); renderHeader(); return render(); }
    renderHeader(); okMsg(form, t('saved'));
  });
  bindForm($('#cf'), async (v, form) => { await post('/api/account/password', v); form.reset(); okMsg(form, t('pw_changed')); });
}

export async function ordersPage() {
  if (!requireUser()) return;
  loading();
  let orders;
  try { orders = (await get('/api/orders')).orders; } catch (e) { return errorView(e); }
  app().innerHTML = `<section class="wrap"><div class="dash-head"><h1>${t('orders_title')}</h1></div>
  ${orders.length ? `<div class="table-wrap sec"><table class="t"><thead><tr><th>${t('order')}</th><th>${t('date')}</th><th>${t('items')}</th><th>${t('status')}</th><th class="num">${t('total')}</th></tr></thead><tbody>
    ${orders.map(o => `<tr><td><a href="/orders/${o.id}">#${fmt(o.id)}</a></td><td>${date(o.createdAt)}</td><td>${o.items.map(i => esc(L(i.title))).join('<br>')}</td><td>${badge(o.status)}</td><td class="num">${money(o.total)}</td></tr>`).join('')}
  </tbody></table></div>` : `<div class="empty sec"><p>${t('no_orders')}</p><a class="btn btn-accent" href="/explore">${t('cart_browse')}</a></div>`}
  </section>${footer()}`;
}

export async function orderPage(m) {
  if (!requireUser()) return;
  loading();
  let o;
  try { o = (await get(`/api/orders/${m[1]}`)).order; } catch (e) { return errorView(e); }
  const pay = current.query.get('payment');
  const msg = { paid: 'pay_paid', pending: 'pay_pending', failed: 'pay_failed', refunded: 'pay_refunded' }[o.status];
  const tone = o.status === 'paid' ? 'var(--good)' : o.status === 'failed' || o.status === 'refunded' ? 'var(--bad)' : 'var(--star)';
  app().innerHTML = `<section class="wrap" style="max-width:760px"><div class="dash-head"><div><div class="eyebrow">${date(o.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</div><h1>${t('order_n', { n: fmt(o.id) })}</h1></div>${badge(o.status)}</div>
  ${pay || o.status !== 'paid' ? `<div class="notice" style="background:color-mix(in srgb,${tone} 12%,transparent)">${ic('info')}<span>${t(msg || 'pay_unknown')}${o.failureReason && o.status === 'failed' ? ` (${esc(o.failureReason)})` : ''}</span></div>` : ''}
  <div class="box">
    ${o.items.map(i => `<div class="kv"><a href="/courses/${i.slug}" style="font-weight:600;text-decoration:none">${esc(L(i.title))}</a><span class="tnum">${money(i.price)}</span></div>`).join('')}
    ${o.discount ? `<div class="kv" style="color:var(--good)"><span>${t('discount')}${o.coupon ? ` (${esc(o.coupon)})` : ''}</span><span class="tnum">-${money(o.discount)}</span></div>` : ''}
    <div class="kv trow tot"><span>${t('total')}</span><span>${money(o.total)}</span></div>
  </div>
  <div class="mrow" style="justify-content:flex-start">${o.status === 'paid' ? `<a class="btn btn-accent" href="${o.items.length === 1 ? `/learn/${o.items[0].slug}` : '/learning'}">${t('start_learning')}</a>` : ''}${o.status === 'pending' ? `<button class="btn btn-ghost" id="recheck">${t('retry')}</button>` : ''}<a class="btn btn-ghost" href="/orders">${t('orders_title')}</a></div>
  </section>${footer()}`;
  $('#recheck')?.addEventListener('click', () => render());
}
