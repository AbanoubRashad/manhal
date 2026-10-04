import { store, t, esc, fmt, money, dur, L, lvl } from '../state.js';
import { get, post } from '../api.js';
import { ic } from '../icons.js';
import { app, $, $$, card, mini, footer, loading, errorView, toast, renderHeader } from '../ui.js';
import { navigate } from '../router.js';
import { openCart } from '../cart.js';

export const GOALS = {
  data: ['sql-for-analysts', 'python-for-data-analysis', 'machine-learning-foundations'],
  web: ['full-stack-web-development-with-javascript', 'react-and-next-js-in-practice', 'business-english-for-the-workplace'],
  design: ['ui-ux-design-from-sketch-to-prototype', 'brand-identity-design', 'freelancing-win-your-first-clients'],
  biz: ['digital-marketing-essentials', 'social-media-ads-that-convert', 'project-management-fundamentals'],
};
let goal = 'data';

export async function homePage() {
  loading();
  let data;
  try { data = await get('/api/home'); } catch (e) { return errorView(e); }
  store.courses = data.courses;
  const { stats, categories: cats, courses } = data;
  const trend = courses.slice(0, 8);
  app().innerHTML = `
  <section class="wrap hero">
    <div class="hero-copy">
      <div class="eyebrow">${t('hero_eyebrow')}</div>
      <h1>${t('hero_title')}</h1>
      <p class="lede">${t('hero_sub')}</p>
      <form class="hsearch" id="hsearch" role="search">${ic('search')}<input id="hq" type="search" autocomplete="off" placeholder="${t('hero_search_ph')}" aria-label="${t('hero_search_ph')}"><button class="btn btn-accent" type="submit">${t('hero_btn')}</button><div class="sugg" id="sugg" hidden></div></form>
      <div class="popular"><span>${t('popular')}</span>${['Python', 'UI/UX', 'Excel', 'SQL', 'React'].map(p => `<a class="pill" href="/explore?q=${encodeURIComponent(p)}" style="text-decoration:none">${p}</a>`).join('')}</div>
    </div>
    <div class="pathcard">
      <h2>${t('path_title')}</h2><p class="muted">${t('path_sub')}</p>
      <div class="goals" role="radiogroup" aria-label="${t('path_title')}">${Object.keys(GOALS).map(g => `<button role="radio" class="goal" data-goal="${g}" aria-checked="${g === goal}">${t('goal_' + g)}</button>`).join('')}</div>
      <ol class="steps" id="steps"></ol><div class="path-foot" id="pathfoot"></div>
    </div>
  </section>
  <section class="wrap"><div class="stats">
    <div><b class="tnum">${fmt(stats.learners)}</b><span>${t('st_learners')}</span></div>
    <div><b class="tnum">${fmt(stats.courses)}</b><span>${t('st_courses')}</span></div>
    <div><b class="tnum">${fmt(stats.instructors)}</b><span>${t('st_inst')}</span></div>
    <div><b class="tnum">${fmt(stats.rating.toFixed(1))}</b><span>${t('st_rating')}</span></div>
  </div></section>
  <section class="wrap sec"><div class="sec-head"><h2>${t('cats_title')}</h2></div>
    <div class="cats">${cats.map(c => `<a class="catb" href="/explore?cat=${c.key}" style="--h:${c.hue};text-decoration:none"><span class="g">${esc(c.glyph)}</span><span><b>${esc(L(c.name))}</b><small>${fmt(c.count)} ${t('courses_n')}</small></span></a>`).join('')}</div></section>
  <section class="wrap sec"><div class="sec-head"><h2>${t('trend_title')}</h2><a href="/explore">${t('see_all')}${ic('chev', 'sm flip')}</a></div>
    <div class="grid trend">${trend.map(c => card(c, cats)).join('')}</div></section>
  <section class="wrap sec"><div class="sec-head"><h2>${t('how_title')}</h2></div>
    <ol class="how"><li><h3>${t('how1_t')}</h3><p>${t('how1_d')}</p></li><li><h3>${t('how2_t')}</h3><p>${t('how2_d')}</p></li><li><h3>${t('how3_t')}</h3><p>${t('how3_d')}</p></li></ol></section>
  <section class="wrap sec"><div class="sec-head"><h2>${t('plans_title')}</h2></div>
    <div class="plans">
      <div class="plan"><h3>${t('plan_free')}</h3><div class="amt">${fmt(0)} <small>${t('currency')}</small></div><p class="muted">${t('plan_free_d')}</p><a class="btn btn-ghost" href="/explore?price=free">${t('plan_free_btn')}</a></div>
      <div class="plan hi"><h3>${t('plan_plus')}</h3><div class="amt">${fmt(199)} <small>${t('currency')} ${t('per_month')}</small></div><p class="muted">${t('plan_plus_d')}</p><button class="btn btn-accent" data-soon>${t('plan_plus_btn')}</button></div>
      <div class="plan"><h3>${t('plan_team')}</h3><div class="amt">${t('custom')}</div><p class="muted">${t('plan_team_d')}</p><button class="btn btn-ghost" data-soon>${t('plan_team_btn')}</button></div>
    </div></section>
  <section class="wrap sec"><div class="cta"><div><h2>${t('teach_cta_t')}</h2><p>${t('teach_cta_d')}</p></div><a class="btn btn-accent" href="/teach">${t('teach_cta_btn')}</a></div></section>
  ${footer()}`;
  renderPath();

  const hq = $('#hq'), sg = $('#sugg');
  hq.addEventListener('input', () => {
    const q = hq.value.trim().toLowerCase();
    if (!q) { sg.hidden = true; return; }
    const r = courses.filter(c => [c.title.en, c.title.ar, c.instructor.name].some(s => s.toLowerCase().includes(q))).slice(0, 5);
    sg.innerHTML = r.length ? r.map(c => `<a href="/courses/${c.slug}">${mini(c)}<span><b>${esc(L(c.title))}</b><small>${esc(c.instructor.name)}</small></span></a>`).join('') : `<p class="muted" style="padding:8px">${t('pal_empty')}</p>`;
    sg.hidden = false;
  });
  hq.addEventListener('blur', () => setTimeout(() => { sg.hidden = true; }, 180));
  $('#hsearch').addEventListener('submit', e => { e.preventDefault(); navigate(`/explore?q=${encodeURIComponent(hq.value.trim())}`); });
  $$('[data-goal]').forEach(b => b.addEventListener('click', () => {
    goal = b.dataset.goal;
    $$('.goal').forEach(x => x.setAttribute('aria-checked', x.dataset.goal === goal));
    renderPath();
  }));
  $$('[data-soon]').forEach(b => b.addEventListener('click', () => toast(t('toast_soon'), 'info')));
}

function pathCourses() { return GOALS[goal].map(s => store.courses.find(c => c.slug === s)).filter(Boolean); }

function renderPath() {
  const list = pathCourses();
  let mins = 0, cost = 0;
  $('#steps').innerHTML = list.map((c, i) => {
    mins += c.minutes;
    if (!c.enrolled) cost += c.price;
    return `<li>${mini(c)}<div><div class="st">${t('step')} ${fmt(i + 1)} · ${lvl(c.level)}</div><a href="/courses/${c.slug}">${esc(L(c.title))}</a><small class="muted">${dur(c.minutes)}</small></div><span class="sp ${c.price === 0 ? 'price free' : ''}">${c.enrolled ? `<span class="tag tag-en">${t('enrolled')}</span>` : money(c.price)}</span></li>`;
  }).join('');
  $('#pathfoot').innerHTML = `<div><span class="muted">${t('path_total')}</span> <b class="tnum">${dur(mins)} · ${money(cost)}</b></div><button class="btn btn-brand" id="startpath">${t('path_start')}</button>`;
  $('#startpath').addEventListener('click', startPath);
}

async function startPath() {
  if (!store.me) return navigate('/login?next=%2F');
  for (const c of pathCourses()) {
    if (c.enrolled) continue;
    try {
      if (c.price === 0) await post(`/api/courses/${c.id}/enroll`);
      else await post('/api/cart', { courseId: c.id });
    } catch { /* already in cart */ }
  }
  const me = await get('/api/me'); store.cartCount = me.cartCount;
  renderHeader();
  toast(t('toast_path'));
  if (store.cartCount) openCart();
}
