import { store, t, esc, L, date } from './state.js';
import { get, post } from './api.js';
import { ic } from './icons.js';
import { app, $, footer, loading, errorView, requireUser, renderHeader, toastErr } from './ui.js';
import { navigate } from './router.js';

const ICON = { coach: 'spark', live: 'live', news: 'mega', answer: 'chat', question: 'chat', certificate: 'award', budget: 'coin' };

const item = n => `<button class="nitem ${n.read ? '' : 'unread'}" data-nopen="${n.id}">
  <span class="ni ${n.coach ? 'coach' : ''}">${ic(ICON[n.kind] || 'bell')}</span>
  <span class="nt"><b>${esc(L(n.title))}</b>${L(n.body) ? `<small>${esc(L(n.body))}</small>` : ''}<small class="nd">${date(n.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${n.coach ? ` · ${t('from_nour')}` : ''}</small></span>
</button>`;

const list = items => (items.length ? items.map(item).join('') : `<p class="muted nempty">${t('no_notifications')}</p>`);

/** Open a notification: marks it read (and clicked, for coach nudges) and follows its link. */
export async function openNotification(id) {
  try {
    const r = await post(`/api/notifications/${id}/open`);
    store.unread = r.unread;
    renderHeader();
    navigate(r.link);
  } catch (e) { toastErr(e); }
}

async function markAll() {
  try { await post('/api/notifications/read-all'); store.unread = 0; renderHeader(); } catch (e) { toastErr(e); }
}

/** The header dropdown. */
export async function toggleBell(btn) {
  const wrap = btn.parentElement;
  const open = $('.npanel', wrap);
  if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  document.querySelector('.menu')?.remove();
  const el = document.createElement('div');
  el.className = 'npanel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('notifications'));
  el.innerHTML = `<div class="nhead"><b>${t('notifications')}</b></div><div class="nlist"><div class="spin" style="margin:18px auto"></div></div>`;
  wrap.appendChild(el);
  btn.setAttribute('aria-expanded', 'true');
  try {
    const r = await get('/api/notifications');
    store.unread = r.unread;
    el.innerHTML = `<div class="nhead"><b>${t('notifications')}</b>${r.unread ? `<button class="linkbtn" style="color:var(--brand)" data-nreadall>${t('mark_all_read')}</button>` : ''}</div>
      <div class="nlist">${list(r.items.slice(0, 8))}</div><a class="nall" href="/notifications">${t('see_all_notifs')}</a>`;
  } catch (e) { el.remove(); toastErr(e); }
}

export async function notificationsPage() {
  if (!requireUser()) return;
  loading();
  let r;
  try { r = await get('/api/notifications'); } catch (e) { return errorView(e); }
  store.unread = r.unread;
  renderHeader();
  app().innerHTML = `<section class="wrap" style="max-width:760px"><div class="dash-head"><div><h1>${t('notifications')}</h1><p class="muted">${t('notif_sub')}</p></div>
    ${r.unread ? `<button class="btn btn-ghost" data-nreadall>${t('mark_all_read')}</button>` : ''}</div>
    <div class="box nbox sec">${list(r.items)}</div>
    <p class="muted" style="font-size:.9rem;margin-top:-40px;margin-bottom:48px">${t('notif_settings_hint')} <a href="/account#mentor" style="color:var(--brand);font-weight:700">${t('mentor_settings')}</a></p></section>${footer()}`;
}

/** Links in notification emails go to /n/:id so opening them counts as a click. */
export async function notificationLinkPage(m) {
  if (!requireUser()) return;
  loading();
  try {
    const r = await post(`/api/notifications/${m[1]}/open`);
    store.unread = r.unread;
    navigate(r.link, { replace: true });
  } catch (e) { errorView(e); }
}

export function onNotificationClick(el) {
  if (el.dataset.nopen) { el.closest('.npanel')?.remove(); return openNotification(Number(el.dataset.nopen)); }
  if ('nreadall' in el.dataset) return markAll().then(() => { el.closest('.npanel')?.remove(); if (location.pathname === '/notifications') notificationsPage(); });
  return null;
}
