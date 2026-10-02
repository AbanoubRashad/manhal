import { store, t, esc, money, L } from './state.js';
import { ic } from './icons.js';
import { $, $$, mini } from './ui.js';
import { navigate } from './router.js';
import { catalog } from './cart.js';

let sel = 0, items = [];

/** Ctrl/Cmd+K quick search across pages and courses. */
export async function openPal() {
  const p = $('#pal');
  p.innerHTML = `<div class="pal-card" role="dialog" aria-modal="true" aria-label="${t('pal_ph')}"><div class="pal-in">${ic('search')}<input id="palq" placeholder="${t('pal_ph')}" aria-label="${t('pal_ph')}" autocomplete="off"><span class="kbd">Esc</span></div><div class="pal-list" id="pall"></div></div>`;
  p.hidden = false;
  const q = $('#palq');
  q.focus();
  try { await catalog(); } catch { /* pages still searchable */ }
  q.addEventListener('input', () => draw(q.value));
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); hi(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); hi(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[sel]) { closePal(); navigate(items[sel]); }
  });
  draw('');
}
export function closePal() { const p = $('#pal'); p.hidden = true; p.innerHTML = ''; }

function draw(raw) {
  const q = raw.trim().toLowerCase();
  const pages = [['/', t('nav_home'), 'home'], ['/explore', t('nav_explore'), 'compass'], ['/learning', t('nav_learning'), 'book'], ['/teach', t('nav_teach'), 'users'], ['/certificates', t('verify_cert'), 'award']];
  if (store.me) pages.push(['/orders', t('orders'), 'receipt'], ['/account', t('account'), 'user']);
  if (store.me && store.me.role !== 'learner') pages.push(['/studio', t('studio'), 'pen'], ['/studio/earnings', t('earnings'), 'coin']);
  if (store.me?.role === 'admin') pages.push(['/admin', t('admin'), 'shield']);
  const pg = pages.filter(p => !q || p[1].toLowerCase().includes(q));
  const cs = (store.courses || []).filter(c => !q || [c.title.en, c.title.ar, c.instructor.name].some(s => s.toLowerCase().includes(q))).slice(0, 7);
  items = [...pg.map(p => p[0]), ...cs.map(c => `/courses/${c.slug}`)];
  sel = 0;
  $('#pall').innerHTML = (pg.length ? `<div class="pal-g">${t('pal_pages')}</div>` + pg.map((p, i) => `<a class="pal-i" data-pi="${i}" href="${p[0]}">${ic(p[2])}<span>${p[1]}</span></a>`).join('') : '')
    + (cs.length ? `<div class="pal-g">${t('pal_courses')}</div>` + cs.map((c, j) => `<a class="pal-i" data-pi="${pg.length + j}" href="/courses/${c.slug}">${mini(c)}<span>${esc(L(c.title))}</span><small>${money(c.price)}</small></a>`).join('') : '')
    + (!items.length ? `<p class="muted" style="padding:14px">${t('pal_empty')}</p>` : '');
  hi();
}
function hi() {
  $$('.pal-i').forEach(a => a.classList.toggle('on', Number(a.dataset.pi) === sel));
  $('.pal-i.on')?.scrollIntoView({ block: 'nearest' });
}
