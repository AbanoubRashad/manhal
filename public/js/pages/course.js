import { store, t, esc, fmt, money, dur, L, lvl, initials } from '../state.js';
import { get } from '../api.js';
import { ic } from '../icons.js';
import { app, $, card, cover, footer, loading, errorView } from '../ui.js';
import { addToCart, enrollFree, toggleWish } from '../cart.js';

function buyButtons(c) {
  if (c.enrolled) return `<a class="btn btn-accent btn-block" href="/learn/${c.slug}">${c.progress?.percent > 0 ? t('resume') : t('go_course')}</a>`;
  if (c.price === 0) return `<button class="btn btn-accent btn-block" id="b-enroll">${t('enroll_free')}</button>`;
  const inCart = store.me ? c.inCart : store.guestCart.includes(c.id);
  if (inCart) return `<button class="btn btn-brand btn-block" data-cart>${t('in_cart')}</button>`;
  return `<div class="prow"><button class="btn btn-accent" id="b-add">${t('add_cart')}</button><button class="btn btn-ghost" id="b-buy">${t('buy_now')}</button></div>`;
}

export async function coursePage(m) {
  loading();
  let c, cats;
  try {
    [{ course: c }, { categories: cats }] = await Promise.all([get(`/api/courses/${m[1]}`), get('/api/categories')]);
  } catch (e) { return errorView(e); }
  const cat = cats.find(x => x.key === c.category);
  const lessons = c.sections.flatMap(s => s.lessons);
  const learn = [0, 4, 6, 7, 9, 11].map(i => lessons[i]).filter(Boolean);
  document.title = `${L(c.title)} · ${t('brand')}`;

  app().innerHTML = `
  <section class="dband"><div class="wrap dgrid"><div class="dmain">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/explore">${t('nav_explore')}</a>${ic('chev', 'flip')}<a href="/explore?cat=${c.category}">${esc(L(cat?.name))}</a></nav>
    ${c.status !== 'published' ? `<span class="st-badge st-${c.status}" style="margin-bottom:10px">${t('st_' + c.status)}</span>` : ''}
    <h1>${esc(L(c.title))}</h1><p class="dlede">${esc(L(c.summary))}</p>
    <div class="dmeta"><span class="rate">${ic('star', 'fill')}<b>${fmt(c.rating)}</b></span><span>${ic('users')}${fmt(c.learners)} ${t('students')}</span><span>${ic('layers')}${lvl(c.level)}</span><span>${ic('clock')}${dur(c.minutes)}</span></div>
    <div class="dby">${t('by')} <strong>${esc(c.instructor.name)}</strong></div>
  </div></div></section>
  <section class="wrap dgrid dbody">
    <div class="dmain">
      ${learn.length ? `<div class="box"><h2 style="margin:0">${t('learn_title')}</h2><ul class="checks">${learn.map(x => `<li>${ic('check')}<span>${esc(L(x.title))}</span></li>`).join('')}</ul></div>` : ''}
      <h2>${t('curr_title')}</h2>
      <p class="muted" style="margin-top:-8px">${fmt(c.sections.length)} ${t('sections_n')} · ${fmt(lessons.length)} ${t('lessons_n')} · ${dur(c.minutes)}</p>
      <div class="acc">${c.sections.map((s, si) => `<details ${si === 0 ? 'open' : ''}><summary><span>${t('module')} ${fmt(si + 1)}: ${esc(L(s.title))}</span><span class="muted">${fmt(s.lessons.length)} ${t('lessons_n')} · ${dur(s.lessons.reduce((a, l) => a + l.minutes, 0))}</span></summary>
        <ul>${s.lessons.map(l => `<li>${ic('video', 'sm')}<span>${l.preview && !c.enrolled ? `<a href="/learn/${c.slug}/lesson/${l.id}" style="color:var(--brand);font-weight:700">${esc(L(l.title))}</a> <span class="tag tag-en">${t('preview')}</span>` : esc(L(l.title))}</span><span class="muted tnum">${fmt(l.minutes)} ${t('min')}</span></li>`).join('')}</ul></details>`).join('')}
        ${c.quizCount ? `<div class="acc-quiz">${ic('quiz')}<span>${t('checkpoint')}</span><span class="muted">${fmt(c.quizCount)} ${t('questions_n')}</span></div>` : ''}</div>
      <h2>${t('inst_title')}</h2>
      <div class="inst"><div class="avatar" style="--h:${c.hue}">${esc(initials(c.instructor.name))}</div><div><strong style="font-size:1.1rem">${esc(c.instructor.name)}</strong><div class="muted">${esc(c.instructor.headline)}</div><div class="imeta"><span>${fmt(c.instructor.courses)} ${t('courses_n')}</span><span>${fmt(c.instructor.learners)} ${t('students')}</span></div></div></div>
      ${c.instructor.bio ? `<p class="muted">${esc(c.instructor.bio)}</p>` : ''}
    </div>
    <aside class="buy">${cover(c)}<div class="buy-b">
      <div class="bprice">${c.price === 0 ? `<span class="price free">${t('free')}</span>` : `<span class="price">${money(c.price)}</span>`}</div>
      <div id="buybtns">${buyButtons(c)}</div>
      <button class="btn btn-ghost btn-block" id="b-wish" aria-pressed="${Boolean(c.wished)}">${ic('heart', c.wished ? 'fill' : '')}${c.wished ? t('wish_saved') : t('wish_add')}</button>
      ${c.enrolled && c.progress ? `<div><div class="bar"><i style="width:${c.progress.percent}%"></i></div><small class="muted">${fmt(c.progress.percent)}% ${t('progress')}</small></div>` : ''}
      <ul class="inc"><li>${ic('video')}${dur(c.minutes)} ${t('inc_video')}</li><li>${ic('book')}${fmt(lessons.length)} ${t('lessons_n')}</li><li>${ic('quiz')}${t('inc_quiz')}</li><li>${ic('award')}${t('inc_cert')}</li><li>${ic('phone')}${t('inc_mobile')}</li></ul>
    </div></aside>
  </section>
  ${c.related.length ? `<section class="wrap sec"><div class="sec-head"><h2>${t('related')}</h2></div><div class="grid">${c.related.map(x => card(x, cats)).join('')}</div></section>` : ''}${footer()}`;

  const wire = () => {
    $('#b-enroll')?.addEventListener('click', () => enrollFree(c));
    $('#b-add')?.addEventListener('click', async () => { await addToCart(c); $('#buybtns').innerHTML = buyButtons(c); wire(); });
    $('#b-buy')?.addEventListener('click', async () => { await addToCart(c, { open: true }); $('#buybtns').innerHTML = buyButtons(c); wire(); });
  };
  wire();
  $('#b-wish').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const on = await toggleWish(c.id, c.wished);
    if (on === null) return;
    c.wished = on;
    btn.innerHTML = ic('heart', on ? 'fill' : '') + (on ? t('wish_saved') : t('wish_add'));
    btn.setAttribute('aria-pressed', on);
  });
}
