// Pages reached from emails: one-click coach unsubscribe and parent-contact confirmation.
import { t, esc, tErr } from '../state.js';
import { post } from '../api.js';
import { ic } from '../icons.js';
import { app, footer } from '../ui.js';
import { current } from '../router.js';

const page = (title, body, ok) => {
  app().innerHTML = `<section class="wrap auth"><div class="box" style="text-align:center"><span class="big-ic ${ok ? 'ok' : 'bad'}">${ic(ok ? 'check' : 'info')}</span>
    <h1 style="font-size:1.5rem;margin-top:10px">${title}</h1><p class="muted" style="margin-top:8px">${body}</p>
    <a class="btn btn-brand" style="margin-top:18px" href="/">${t('go_home')}</a></div></section>${footer()}`;
};

export async function unsubscribePage() {
  try {
    await post('/api/mentor/unsubscribe', { u: Number(current.query.get('u')), s: current.query.get('s') || '' });
    page(t('unsub_done'), `${t('unsub_done_sub')} <a href="/account#mentor" style="color:var(--brand);font-weight:700">${t('mentor_settings')}</a>`, true);
  } catch (e) { page(t('unsub_bad'), esc(tErr(e.message)), false); }
}

export async function parentConfirmPage() {
  try {
    await post('/api/parent/confirm', { token: current.query.get('token') || '' });
    page(t('parent_ok'), t('parent_ok_sub'), true);
  } catch (e) { page(t('parent_bad'), esc(tErr(e.message)), false); }
}
