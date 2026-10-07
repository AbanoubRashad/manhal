import { store, t, tErr, esc, fmt, money, dur, L, lvl, isDark, initials } from './state.js';
import { ic, LOGO } from './icons.js';
import { current, navigate } from './router.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const app = () => $('#app');

export function toast(msg, icon = 'check') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = ic(icon) + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
export const toastErr = err => toast(tErr(err?.message), 'info');

export function openModal(html, wide = false) {
  const m = $('#modal');
  m.innerHTML = `<div class="scrim open" data-close></div><div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="ib modal-x" data-close aria-label="${t('close')}">${ic('x')}</button>${html}</div>`;
  m.hidden = false;
  setTimeout(() => { const f = $('.modal-card input, .modal-card button:not(.modal-x)', m); f && f.focus(); }, 30);
  return m;
}
export function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

/* ---------- course pieces (from the design) ---------- */
export const cover = c => `<div class="cover pat${c.id % 4}" style="--h:${c.hue}"><span class="glyph">${esc(c.glyph)}</span><span class="lvl">${lvl(c.level)}</span></div>`;
export const mini = c => `<span class="mini" style="--h:${c.hue}">${esc(c.glyph)}</span>`;
export const priceHTML = c => (c.price === 0 ? `<span class="price free">${t('free')}</span>` : `<span class="price">${money(c.price)}</span>`);
export const catName = (key, cats) => L(cats?.find(c => c.key === key)?.name) || key;

export function card(c, cats) {
  return `<article class="card">${cover(c)}<div class="card-b"><div class="eyebrow">${esc(catName(c.category, cats))}</div><h3><a class="stretch" href="/courses/${c.slug}">${esc(L(c.title))}</a></h3><div class="by">${esc(c.instructor.name)}</div>
<div class="meta"><span class="rate">${ic('star', 'fill')}${fmt(c.rating)}</span><span>${fmt(c.learners)} ${t('students')}</span><span>${dur(c.minutes)}</span></div>
<div class="pr">${c.enrolled ? `<span class="tag tag-en">${ic('check', 'sm')}${t('enrolled')}</span>` : priceHTML(c)}<button class="wish ${c.wished ? 'on' : ''}" data-wish="${c.id}" aria-pressed="${Boolean(c.wished)}" aria-label="${t('wish_add')}">${ic('heart')}</button></div></div></article>`;
}

export const badge = s => `<span class="st-badge st-${esc(s)}">${esc(t('st_' + s))}</span>`;
export const loading = () => { app().innerHTML = `<div class="loading" aria-live="polite"><div class="spin" role="img" aria-label="${t('loading')}"></div></div>`; };

export function errorView(err) {
  if (err?.status === 404) return notFoundView();
  app().innerHTML = `<section class="wrap err-page"><h1>${esc(err?.status === 0 ? t('err_offline') : tErr(err?.message))}</h1><a class="btn btn-brand" href="/">${t('go_home')}</a></section>${footer()}`;
}
export function notFoundView() {
  app().innerHTML = `<section class="wrap err-page"><div class="eyebrow">404</div><h1>${t('nf_title')}</h1><p class="muted">${t('nf_body')}</p><a class="btn btn-brand" href="/">${t('go_home')}</a></section>${footer()}`;
}

/** Send guests to sign in, then back here. Returns false when not signed in. */
export function requireUser() {
  if (store.me) return true;
  navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
  return false;
}

export function footer() {
  return `<footer><div class="wrap"><a class="logo" href="/" style="font-size:1.1rem">${LOGO}<span style="display:inline">${t('brand')}</span></a>
  <nav aria-label="Footer"><a href="/teach">${t('nav_teach')}</a><a href="/certificates">${t('verify_cert')}</a><a href="/terms">${t('terms')}</a><a href="/privacy">${t('privacy')}</a><a href="/refunds">${t('refunds')}</a>${store.config.devMail ? `<a href="/dev/mail">${t('dev_mail')}</a>` : ''}</nav>
  <span>© ${new Date().getFullYear()} ${t('brand')}</span>
  ${store.config.demo ? `<span style="flex-basis:100%;font-size:.8rem">${t('demo_note')} <button class="linkbtn" style="color:var(--brand)" data-resetdemo>${t('demo_reset')}</button></span>` : ''}</div></footer>`;
}

export function renderHeader() {
  const nav = current.nav;
  const me = store.me;
  const n = me ? store.cartCount : store.guestCart.length;
  const items = [['home', '/', t('nav_home')], ['explore', '/explore', t('nav_explore')], ['learning', '/learning', t('nav_learning')], ['teach', '/teach', t('nav_teach')]];
  $('#top').innerHTML = `<div class="wrap">
  <a class="logo" href="/" aria-label="${t('brand')}">${LOGO}<span>${t('brand')}</span></a>
  <nav class="nav" aria-label="Main">${items.map(([k, h, l]) => `<a class="nl" href="${h}" ${nav === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <button class="sbtn" data-pal>${ic('search')}<span>${t('search_ph')}</span><kbd class="kbd">Ctrl K</kbd></button>
  <div class="tools">
    <button class="langbtn" data-lang lang="${store.lang === 'ar' ? 'en' : 'ar'}">${t('lang_btn')}</button>
    <button class="ib" data-theme-t aria-label="${t('theme')}">${ic(isDark() ? 'sun' : 'moon')}</button>
    <button class="ib cartbtn" data-cart aria-label="${t('nav_cart')}">${ic('cart')}${n ? `<span class="badge">${fmt(n)}</span>` : ''}</button>
    ${me ? `<div class="bellwrap"><button class="ib bellbtn" data-bell aria-haspopup="true" aria-expanded="false" aria-label="${t('notifications')}${store.unread ? ` (${fmt(store.unread)})` : ''}">${ic('bell')}${store.unread ? `<span class="badge">${fmt(store.unread)}</span>` : ''}</button></div>` : ''}
    ${me ? `<div class="umenu"><button class="avatar-sm" data-umenu aria-haspopup="true" aria-expanded="false" aria-label="${esc(me.name)}">${esc(initials(me.name))}</button></div>`
    : `<a class="signin" href="/login">${t('sign_in')}</a>`}
  </div></div>`;
  $('#tabbar').innerHTML = `<a href="/" ${nav === 'home' ? 'aria-current="page"' : ''}>${ic('home')}${t('nav_home')}</a><a href="/explore" ${nav === 'explore' ? 'aria-current="page"' : ''}>${ic('compass')}${t('nav_explore')}</a><a href="/learning" ${nav === 'learning' ? 'aria-current="page"' : ''}>${ic('book')}${t('nav_learning')}</a><button data-cart>${ic('cart')}${t('nav_cart')}${n ? `<span class="badge">${fmt(n)}</span>` : ''}</button>${me ? `<a href="/notifications" ${nav === 'alerts' ? 'aria-current="page"' : ''}>${ic('bell')}${t('alerts')}${store.unread ? `<span class="badge">${fmt(store.unread)}</span>` : ''}</a>` : ''}`;
  $('#tabbar').classList.toggle('five', Boolean(me));
  renderBanner();
}

export function userMenu(btn) {
  const wrap = btn.parentElement;
  const open = $('.menu', wrap);
  if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const me = store.me;
  const el = document.createElement('div');
  el.className = 'menu';
  el.innerHTML = `<div class="who"><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div>
    <a href="/learning">${ic('book')}${t('nav_learning')}</a>
    <a href="/orders">${ic('receipt')}${t('orders')}</a>
    <a href="/account">${ic('user')}${t('account')}</a>
    ${me.role !== 'learner' ? `<a href="/studio">${ic('pen')}${t('studio')}</a>` : ''}
    ${me.role === 'admin' ? `<a href="/admin">${ic('shield')}${t('admin')}</a>` : ''}
    <button data-logout>${ic('out')}${t('sign_out')}</button>`;
  wrap.appendChild(el);
  btn.setAttribute('aria-expanded', 'true');
}

function renderBanner() {
  let b = $('#banner');
  const me = store.me;
  const show = me && !me.emailVerified && !location.pathname.startsWith('/verify-email');
  if (!show) { b && b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'banner'; b.className = 'banner'; $('#top').after(b); }
  b.innerHTML = `<div class="wrap">${ic('mail', 'sm')}<span>${t('verify_banner', { email: esc(me.email) })}</span><button data-resend>${t('resend')}</button>${store.config.devMail ? `<a href="/dev/mail" style="color:var(--brand);font-weight:700">${t('dev_mail')}</a>` : ''}</div>`;
}

/**
 * Wire a form to an async submit handler. Shows field errors from the API next to inputs
 * and a summary message, and disables the submit button while working.
 */
export function bindForm(form, handler) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', form) || $('button:not([type])', form);
    $$('.ferr', form).forEach(x => x.remove());
    $$('[aria-invalid]', form).forEach(x => x.removeAttribute('aria-invalid'));
    const msg = $('.form-msg', form);
    if (msg) { msg.className = 'form-msg'; msg.textContent = ''; }
    const values = Object.fromEntries(new FormData(form));
    if (btn) btn.disabled = true;
    try {
      await handler(values, form);
    } catch (err) {
      const fields = err?.data?.fields || {};
      for (const [k, v] of Object.entries(fields)) {
        const input = form.elements[k];
        if (!input || !input.closest) continue;
        input.setAttribute('aria-invalid', 'true');
        const f = input.closest('.field');
        if (f) f.insertAdjacentHTML('beforeend', `<span class="ferr">${esc(tErr(v))}</span>`);
      }
      if (msg) { msg.className = 'form-msg form-err'; msg.textContent = err?.status === 0 ? t('err_offline') : tErr(err?.message); }
      else toastErr(err);
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  });
}
export const okMsg = (form, text) => { const m = $('.form-msg', form); if (m) { m.className = 'form-msg form-ok'; m.textContent = text; } };

export const field = (name, label, attrs = '', hint = '') =>
  `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
