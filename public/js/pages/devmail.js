import { t, esc, date } from '../state.js';
import { get } from '../api.js';
import { app, $$, footer, loading, errorView } from '../ui.js';

/** Shows emails captured by the console provider so verification and reset links can be tested. */
export async function devMailPage() {
  loading();
  let emails;
  try { emails = (await get('/api/dev/outbox')).emails; } catch (e) { return errorView(e); }
  app().innerHTML = `<section class="wrap"><div class="dash-head"><div><h1>${t('dev_mail')}</h1><p class="muted">${t('dev_mail_sub')}</p></div></div>
  ${emails.length ? `<div class="mail-list sec">${emails.map((m, i) => `<article class="mail-item"><header><div><b>${esc(m.subject)}</b><div class="muted" style="font-size:.85rem">${esc(m.to)}</div></div><span class="muted" style="font-size:.85rem">${date(m.sentAt, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span></header><iframe sandbox="allow-top-navigation-by-user-activation allow-popups" data-i="${i}" title="${esc(m.subject)}"></iframe></article>`).join('')}</div>`
    : `<div class="empty sec"><p>${t('no_mail')}</p></div>`}</section>${footer()}`;
  // Links in emails point at this site; open them in the top window.
  $$('iframe[data-i]').forEach(f => { f.srcdoc = emails[Number(f.dataset.i)].html.replace('<body', '<head><base target="_top"></head><body'); });
}
