import { t, esc, fmt, L } from '../state.js';
import { get } from '../api.js';
import { ic } from '../icons.js';
import { app, $, $$, card, footer, loading, errorView } from '../ui.js';
import { navigate, current } from '../router.js';

const DEFAULTS = { q: '', cat: 'all', level: 'all', price: 'all', sort: 'pop' };
let cats = null;

/** Filters live in the URL so results can be shared and the back button works. */
const readFilters = q => Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, q.get(k) || v]));
function setFilters(f) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && v !== DEFAULTS[k]) p.set(k, v);
  navigate(`/explore${p.toString() ? '?' + p : ''}`, { replace: true, keepScroll: true });
}

export async function explorePage(_m, query) {
  const F = readFilters(query);
  if (!$('#grid')) {
    loading();
    try { cats = (await get('/api/categories')).categories; } catch (e) { return errorView(e); }
    const chip = (f, v, l) => `<button class="chip" data-f="${f}" data-v="${v}">${l}</button>`;
    const total = cats.reduce((a, c) => a + c.count, 0);
    app().innerHTML = `<section class="wrap page-head"><div class="eyebrow">${fmt(total)} ${t('courses_n')}</div><h1>${t('nav_explore')}</h1></section>
    <section class="wrap cat-layout">
      <aside class="filters">
        <div class="fgroup"><h4>${t('category')}</h4><div class="flist">${[{ key: 'all', count: total }, ...cats].map(c => `<button class="fbtn" data-f="cat" data-v="${c.key}"><span>${c.key === 'all' ? t('all') : esc(L(c.name))}</span><span class="cnt">${fmt(c.count)}</span></button>`).join('')}</div></div>
        <div class="fgroup"><h4>${t('level')}</h4><div class="chips">${chip('level', 'all', t('all'))}${['beg', 'int', 'adv'].map(v => chip('level', v, t('lv_' + v))).join('')}</div></div>
        <div class="fgroup"><h4>${t('price')}</h4><div class="chips">${chip('price', 'all', t('all'))}${chip('price', 'free', t('free'))}${chip('price', 'paid', t('paid'))}</div></div>
      </aside>
      <div class="results">
        <div class="rbar"><label class="rsearch">${ic('search')}<input id="cq" type="search" placeholder="${t('search_ph')}" aria-label="${t('search_ph')}"></label>
        <select id="sort" aria-label="Sort">${['pop', 'rate', 'low', 'high', 'new'].map(v => `<option value="${v}">${t('sort_' + v)}</option>`).join('')}</select></div>
        <p class="rcount" id="rcount" aria-live="polite"></p><div class="grid" id="grid"></div>
      </div>
    </section>${footer()}`;
    let timer;
    $('#cq').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => setFilters({ ...readFilters(current.query), q: e.target.value.trim() }), 250); });
    $('#sort').addEventListener('change', e => setFilters({ ...readFilters(current.query), sort: e.target.value }));
    $$('[data-f]').forEach(b => b.addEventListener('click', () => setFilters({ ...readFilters(current.query), [b.dataset.f]: b.dataset.v })));
  }
  if ($('#cq') !== document.activeElement) $('#cq').value = F.q;
  $('#sort').value = F.sort;
  $$('[data-f]').forEach(b => b.setAttribute('aria-pressed', F[b.dataset.f] === b.dataset.v));
  try {
    const { courses } = await get('/api/courses?' + new URLSearchParams(F));
    $('#rcount').textContent = `${fmt(courses.length)} ${t('results')}`;
    $('#grid').innerHTML = courses.length ? courses.map(c => card(c, cats)).join('')
      : `<div class="empty" style="grid-column:1/-1"><p>${t('no_results')}</p><a class="btn btn-ghost" href="/explore">${t('clear')}</a></div>`;
  } catch (e) { errorView(e); }
}
