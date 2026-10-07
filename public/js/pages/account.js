import { store, t, esc, money, L, date, fmt, savePrefs, applyLang } from '../state.js';
import { get, patch, post, put, del } from '../api.js';
import { ic } from '../icons.js';
import { app, $, bindForm, okMsg, field, footer, loading, errorView, requireUser, badge, renderHeader, toast, toastErr } from '../ui.js';
import { nourHistoryHTML } from '../nour.js';
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
  </div>
  <div class="acct-grid sec" id="mentor"><div id="mset" class="box"><div class="spin" style="margin:20px auto"></div></div>
    <div><div class="box"><h2>${t('nour_history')}</h2><p class="muted" style="margin:4px 0 12px">${t('nour_history_sub')}</p><div id="nhist"><div class="spin"></div></div></div><div id="mparent"></div></div></div>
  </section>${footer()}`;
  mentorSettings();
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

/* ---------- mentor settings, Nour history and parent contact ---------- */
async function mentorSettings() {
  let m;
  try { m = await get('/api/mentor/settings'); } catch (e) { $('#mset').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const radio = (v, label, hint) => `<label class="opt-card"><input type="radio" name="intensity" value="${v}" ${m.intensity === v ? 'checked' : ''} ${m.minor && v !== 'gentle' ? 'disabled' : ''}><span><b>${label}</b><small class="muted">${hint}</small></span></label>`;
  $('#mset').innerHTML = `<form id="mf" novalidate><h2>${t('mentor_settings')}</h2><p class="muted" style="margin-top:4px">${t('mentor_settings_sub')}</p>
    <label class="switch"><input type="checkbox" name="coachOn" ${m.coachOn ? 'checked' : ''}><span>${t('coach_on')}</span></label>
    <fieldset class="field" style="border:0;padding:0;margin:16px 0 0"><legend style="font-weight:600;font-size:.88rem;margin-bottom:6px">${t('intensity')}</legend>
      ${radio('gentle', t('int_gentle'), t('int_gentle_d'))}${radio('balanced', t('int_balanced'), t('int_balanced_d'))}${radio('push', t('int_push'), t('int_push_d'))}
      ${m.minor ? `<span class="hint">${t('minor_gentle')}</span>` : ''}</fieldset>
    <div class="field"><span style="font-weight:600;font-size:.88rem">${t('channels')}</span>
      <label class="switch"><input type="checkbox" checked disabled><span>${t('ch_inapp')}</span></label>
      <label class="switch"><input type="checkbox" name="emailOn" ${m.emailOn ? 'checked' : ''}><span>${t('ch_email')}</span></label></div>
    <div class="row2"><div class="field"><label for="f-st">${t('study_time')}</label><select id="f-st" name="studyTime">${['any', 'morning', 'afternoon', 'evening'].map(v => `<option value="${v}" ${m.studyTime === v ? 'selected' : ''}>${t('st_time_' + v)}</option>`).join('')}</select></div>
    <div class="field"><label for="f-by">${t('birth_year')}</label><input id="f-by" name="birthYear" type="number" min="1920" max="${new Date().getFullYear() - 5}" value="${m.birthYear ?? ''}" placeholder="${t('optional')}"></div></div>
    <p class="hint" style="font-size:.8rem;margin-top:10px">${t('quiet_hours_note', { tz: esc(m.tz) })}</p>
    <div class="form-msg"></div><button class="btn btn-brand" type="submit" style="margin-top:14px">${t('save')}</button></form>`;
  bindForm($('#mf'), async (v, form) => {
    await put('/api/mentor/settings', { coachOn: Boolean(form.coachOn.checked), emailOn: Boolean(form.emailOn.checked), intensity: v.intensity || 'gentle',
      studyTime: v.studyTime, ...(v.birthYear ? { birthYear: Number(v.birthYear) } : {}) });
    okMsg(form, t('saved'));
    mentorSettings();
  });
  renderParent(m);
  loadHistory();
  if (location.hash === '#mentor') $('#mentor').scrollIntoView({ block: 'start' });
}

function renderParent(m) {
  const box = $('#mparent');
  if (!m.minor) { box.innerHTML = ''; return; }
  box.innerHTML = `<form class="box" id="parf" novalidate style="margin-top:20px"><h2>${t('parent_contact')}</h2><p class="muted" style="margin-top:4px">${t('parent_sub')}</p>
    ${field('email', t('parent_email'), `type="email" value="${esc(m.parentEmail || '')}" autocomplete="off"`)}
    ${m.parentEmail ? `<p class="hint" style="margin-top:6px">${m.parentConfirmed ? `${ic('check', 'sm')} ${t('parent_confirmed')}` : t('parent_pending')}</p>` : ''}
    <div class="form-msg"></div><button class="btn btn-brand" type="submit" style="margin-top:12px">${t('save')}</button></form>`;
  bindForm($('#parf'), async (v, form) => { const r = await put('/api/mentor/parent', { email: v.email }); okMsg(form, r.parentEmail ? t('parent_sent') : t('saved')); });
}

async function loadHistory() {
  const box = $('#nhist');
  try { box.innerHTML = await nourHistoryHTML(); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  box.querySelectorAll('[data-hdel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(t('clear_confirm'))) return;
    try { await del(`/api/mentor/courses/${b.dataset.hdel}`); toast(t('history_cleared')); loadHistory(); } catch (e) { toastErr(e); }
  }));
  box.querySelector('[data-hdelall]')?.addEventListener('click', async () => {
    if (!confirm(t('clear_all_confirm'))) return;
    try { await del('/api/mentor/history'); toast(t('history_cleared')); loadHistory(); } catch (e) { toastErr(e); }
  });
}
