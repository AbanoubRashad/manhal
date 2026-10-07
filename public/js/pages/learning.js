import { store, t, esc, fmt, L } from '../state.js';
import { get } from '../api.js';
import { ic } from '../icons.js';
import { app, cover, card, footer, loading, errorView, requireUser } from '../ui.js';
import { openCertificate } from './certificate.js';
import { liveHTML, wireLive } from '../community.js';

function weekChart(week) {
  const days = t('days');
  const W = 420, H = 190, x0 = 34, x1 = W - 8, y0 = 16, y1 = 150;
  const max = Math.max(60, Math.ceil(Math.max(...week.map(d => d.minutes)) / 20) * 20);
  const step = (x1 - x0) / 7, bw = 30, yv = v => y1 - (v / max) * (y1 - y0);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('activity')}">`;
  for (let v = 0; v <= max; v += max / 4) svg += `<line class="gl" x1="${x0}" x2="${x1}" y1="${yv(v)}" y2="${yv(v)}"/><text class="ax" x="${x0 - 8}" y="${yv(v) + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`;
  week.forEach((d, i) => {
    const cx = x0 + step * i + step / 2, today = i === week.length - 1;
    const label = days[new Date(d.date + 'T12:00:00Z').getUTCDay()];
    if (d.minutes) svg += `<rect class="${today ? 'bt' : 'bb'}" x="${cx - bw / 2}" y="${yv(d.minutes)}" width="${bw}" height="${y1 - yv(d.minutes)}" rx="5"/><text class="bv" x="${cx}" y="${yv(d.minutes) - 6}" text-anchor="middle">${fmt(d.minutes)}</text>`;
    else svg += `<rect x="${cx - bw / 2}" y="${y1 - 3}" width="${bw}" height="3" rx="1.5" style="fill:var(--line)"/>`;
    svg += `<text class="ax" x="${cx}" y="${y1 + 20}" text-anchor="middle" ${today ? 'style="fill:var(--ink);font-weight:700"' : ''}>${label}</text>`;
  });
  return svg + '</svg>';
}

const heatLevel = m => (!m ? '' : m < 15 ? 'h1' : m < 30 ? 'h2' : m < 50 ? 'h3' : 'h4');

export async function learningPage() {
  if (!requireUser()) return;
  loading();
  let d, cats;
  let live = [];
  try { [d, { categories: cats }, { sessions: live }] = await Promise.all([get('/api/learning'), get('/api/categories'), get('/api/live').catch(() => ({ sessions: [] }))]); } catch (e) { return errorView(e); }
  const active = d.courses.filter(c => c.progress.percent < 100).sort((a, b) => b.progress.percent - a.progress.percent);
  const done = d.courses.filter(c => c.progress.percent === 100);
  const first = store.me.name.split(' ')[0];

  app().innerHTML = `<section class="wrap">
  <div class="dash-head"><div><div class="eyebrow">${new Date().toLocaleDateString(store.lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>${t('welcome')}, ${esc(first)}</h1><p class="muted">${t('dash_sub')}</p></div></div>
  <div class="tiles">
    <div class="tile"><span class="ti hot">${ic('flame')}</span><div><b>${fmt(d.stats.streak)}</b><span>${t('streak')}</span></div></div>
    <div class="tile"><span class="ti">${ic('clock')}</span><div><b>${fmt(d.stats.weekMinutes)}</b><span>${t('week_min')}</span></div></div>
    <div class="tile"><span class="ti">${ic('book')}</span><div><b>${fmt(d.stats.inProgress)}</b><span>${t('in_prog')}</span></div></div>
    <div class="tile"><span class="ti hot">${ic('award')}</span><div><b>${fmt(d.stats.completed)}</b><span>${t('certs')}</span></div></div>
  </div>
  <div class="dash-grid">
    <div><h2>${t('continue')}</h2>
      ${active.length ? `<div class="cl-list">${active.map(c => `<div class="cl">${cover(c)}<div style="min-width:0"><h3><a class="stretch" href="/courses/${c.slug}">${esc(L(c.title))}</a></h3>
        <div class="nextl">${c.next ? `${t('next_up')} ${esc(L(c.next.title))}` : t('all_done')}</div><div class="bar"><i style="width:${c.progress.percent}%"></i></div>
        <div class="cl-foot"><span class="muted tnum">${fmt(c.progress.percent)}% ${t('progress')}</span><a class="btn btn-brand" href="/learn/${c.slug}${c.next ? '' : '/quiz'}">${c.progress.percent ? t('resume') : t('start')}</a></div></div></div>`).join('')}</div>`
      : `<div class="empty"><p>${d.courses.length ? t('all_done') : t('dash_empty')}</p><a class="btn btn-accent" href="/explore">${t('cart_browse')}</a></div>`}
      ${done.length ? `<h2 style="margin-top:28px">${t('cert_title')}</h2><div class="certs">${done.map(c => `<div class="certc"><span class="ti">${ic('award')}</span><div><b>${esc(L(c.title))}</b><button data-cert="${c.id}">${t('view_cert')}</button></div></div>`).join('')}</div>` : ''}
    </div>
    <div>
      ${live.length ? `<div class="panel" id="dlive"><h3>${t('live_sessions')}</h3>${liveHTML(live, { showCourse: true })}</div>` : ''}
      <div class="panel"><h3>${t('activity')}</h3>${weekChart(d.week)}</div>
      <div class="panel"><h3>${t('heat')}</h3><div class="heat">${d.heat.map(x => `<i class="${heatLevel(x.minutes)}" title="${x.date}: ${fmt(x.minutes)} ${t('min')}"></i>`).join('')}</div>
        <div class="hleg">${t('less')} <i style="background:var(--sunk)"></i><i style="background:color-mix(in srgb,var(--brand) 28%,var(--sunk))"></i><i style="background:color-mix(in srgb,var(--brand) 52%,var(--sunk))"></i><i style="background:color-mix(in srgb,var(--brand) 76%,var(--sunk))"></i><i style="background:var(--brand)"></i> ${t('more')}</div></div>
    </div>
  </div>
  ${d.wishlist.length ? `<div class="sec" style="margin-top:36px"><div class="sec-head"><h2>${t('wish_title')}</h2></div><div class="grid">${d.wishlist.map(c => card(c, cats)).join('')}</div></div>` : ''}
  </section>${footer()}`;

  if (live.length) wireLive(app().querySelector('#dlive'), live);
  app().querySelectorAll('[data-cert]').forEach(b => b.addEventListener('click', () => {
    const c = d.courses.find(x => x.id === Number(b.dataset.cert));
    openCertificate(c);
  }));
}
