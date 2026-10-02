import { store, t, tErr, esc } from '../state.js';
import { post } from '../api.js';
import { app, $, $$, bindForm, okMsg, field, footer, renderHeader, toast, toastErr } from '../ui.js';
import { navigate, current } from '../router.js';
import { refreshMe, mergeGuestCart, openCart } from '../cart.js';

const DEMO = [
  ['learner', 'learner@manhal.test', 'manhal-learn'],
  ['instructor', 'salma@manhal.test', 'manhal-teach'],
  ['admin', 'admin@manhal.test', 'manhal-admin'],
];

/** Only allow same-site relative redirects after sign-in. */
const safeNext = () => { const n = current.query.get('next') || '/learning'; return n.startsWith('/') && !n.startsWith('//') ? n : '/learning'; };

async function afterSignIn() {
  await refreshMe();
  await mergeGuestCart();
  store.courses = null;
  renderHeader();
  const next = safeNext();
  if (next === '/cart') { navigate('/learning', { replace: true }); openCart(); } else navigate(next, { replace: true });
}

const shell = (title, sub, body) => `<section class="auth"><div class="box"><h1>${title}</h1>${sub ? `<p class="muted" style="margin-top:6px">${sub}</p>` : ''}${body}</div></section>${footer()}`;

export function loginPage() {
  if (store.me) return navigate(safeNext(), { replace: true });
  const next = current.query.get('next');
  app().innerHTML = shell(t('login_title'), t('login_sub'), `<form id="lf" novalidate>
    ${field('email', t('email'), 'type="email" autocomplete="email" required')}
    ${field('password', t('password'), 'type="password" autocomplete="current-password" required')}
    <p style="margin-top:8px"><a href="/forgot-password" style="color:var(--brand);font-weight:600;font-size:.9rem">${t('forgot_link')}</a></p>
    <div class="form-msg"></div>
    <button class="btn btn-accent btn-block" type="submit" style="margin-top:16px">${t('sign_in')}</button></form>
    ${store.config.devMail || store.config.demo ? `<div class="demo-accts"><small>${t('demo_accounts')}</small>${DEMO.map(([r, e, p]) => `<button type="button" data-e="${e}" data-p="${p}"><span>${t('role_' + r)}</span><small>${e}</small></button>`).join('')}</div>` : ''}
    <p class="alt">${t('no_account')} <a href="/register${next ? `?next=${encodeURIComponent(next)}` : ''}">${t('sign_up')}</a></p>`);
  $$('.demo-accts button').forEach(b => b.addEventListener('click', () => { $('#f-email').value = b.dataset.e; $('#f-password').value = b.dataset.p; $('#lf').requestSubmit(); }));
  bindForm($('#lf'), async v => { await post('/api/auth/login', v); await afterSignIn(); });
}

export function registerPage() {
  if (store.me) return navigate(safeNext(), { replace: true });
  const next = current.query.get('next');
  app().innerHTML = shell(t('register_title'), t('register_sub'), `<form id="rf" novalidate>
    ${field('name', t('name'), 'autocomplete="name" required maxlength="80"')}
    ${field('email', t('email'), 'type="email" autocomplete="email" required')}
    ${field('password', t('password'), 'type="password" autocomplete="new-password" required minlength="8"', t('pw_hint'))}
    <div class="form-msg"></div>
    <button class="btn btn-accent btn-block" type="submit" style="margin-top:16px">${t('sign_up')}</button>
    <p class="muted" style="font-size:.8rem;margin-top:12px">By creating an account you agree to the <a href="/terms">${t('terms')}</a> and <a href="/privacy">${t('privacy')}</a>.</p></form>
    <p class="alt">${t('have_account')} <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">${t('sign_in')}</a></p>`);
  if (store.lang === 'ar') $('#rf p.muted').innerHTML = `بإنشاء حساب فأنت توافق على <a href="/terms">${t('terms')}</a> و<a href="/privacy">${t('privacy')}</a>.`;
  bindForm($('#rf'), async v => { await post('/api/auth/register', { ...v, lang: store.lang }); await afterSignIn(); });
}

export function forgotPage() {
  app().innerHTML = shell(t('forgot_title'), t('forgot_sub'), `<form id="ff" novalidate>
    ${field('email', t('email'), `type="email" autocomplete="email" required value="${esc(store.me?.email || '')}"`)}
    <div class="form-msg"></div>
    <button class="btn btn-accent btn-block" type="submit" style="margin-top:16px">${t('forgot_btn')}</button></form>
    <p class="alt"><a href="/login">${t('back_signin')}</a></p>`);
  bindForm($('#ff'), async (v, form) => { await post('/api/auth/forgot', v); okMsg(form, t('forgot_sent')); });
}

export function resetPage() {
  const token = current.query.get('token');
  if (!token) { app().innerHTML = shell(t('reset_title'), '', `<div class="form-err">${t('link_missing')}</div>`); return; }
  app().innerHTML = shell(t('reset_title'), '', `<form id="pf" novalidate>
    ${field('password', t('new_password'), 'type="password" autocomplete="new-password" required minlength="8"', t('pw_hint'))}
    <div class="form-msg"></div>
    <button class="btn btn-accent btn-block" type="submit" style="margin-top:16px">${t('reset_btn')}</button></form>`);
  bindForm($('#pf'), async (v, form) => {
    await post('/api/auth/reset', { token, password: v.password });
    store.me = null; store.csrf = null; renderHeader();
    form.innerHTML = `<div class="form-ok">${t('reset_done')}</div><a class="btn btn-brand btn-block" href="/login" style="margin-top:16px">${t('sign_in')}</a>`;
  });
}

export async function verifyEmailPage() {
  const token = current.query.get('token');
  app().innerHTML = shell(t('verify_title'), '', `<div id="vmsg" class="loading" style="min-height:80px"><div class="spin"></div></div>`);
  if (!token) { $('#vmsg').outerHTML = `<div class="form-err">${t('link_missing')}</div>`; return; }
  try {
    await post('/api/auth/verify', { token });
    if (store.me) { await refreshMe(); renderHeader(); }
    $('#vmsg').outerHTML = `<div class="form-ok">${t('verify_ok')}</div><a class="btn btn-brand btn-block" href="${store.me ? '/learning' : '/login'}" style="margin-top:16px">${store.me ? t('start_learning') : t('sign_in')}</a>`;
  } catch (e) {
    $('#vmsg').outerHTML = `<div class="form-err">${esc(tErr(e.message))}</div>`;
  }
}

export async function resendVerification() {
  try { await post('/api/auth/resend-verification'); toast(t('resent'), 'mail'); } catch (e) { toastErr(e); }
}

export async function logout() {
  try { await post('/api/auth/logout'); } catch { /* signed out anyway */ }
  store.me = null; store.csrf = null; store.cartCount = 0; store.courses = null;
  await refreshMe().catch(() => {});
  renderHeader();
  navigate('/');
}
