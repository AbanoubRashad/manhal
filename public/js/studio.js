import { store, t, tErr, esc, fmt, money, egp, L, date } from './state.js';
import { get, post, put } from './api.js';
import { ic } from './icons.js';
import { app, $, $$, cover, badge, footer, loading, errorView, requireUser, toast, openModal, closeModal, bindForm, okMsg, field } from './ui.js';
import { navigate, onLeave, current } from './router.js';

let cats = [];
const LEVELS = ['beg', 'int', 'adv', 'all'];

function guard() {
  if (!requireUser()) return false;
  if (store.me.role === 'learner') { navigate('/teach', { replace: true }); return false; }
  return true;
}
const subnav = () => `<nav class="subnav" aria-label="${t('studio')}"><a href="/studio" ${current.path === '/studio' ? 'aria-current="page"' : ''}>${t('my_courses')}</a><a href="/studio/earnings" ${current.path === '/studio/earnings' ? 'aria-current="page"' : ''}>${t('earnings')}</a></nav>`;
const head = (title, extra = '') => `<div class="dash-head"><div><div class="eyebrow">${t('studio')}</div><h1>${title}</h1><p class="muted">${t('studio_sub')}</p></div>${extra}</div>`;

/* ---------- course list ---------- */
export async function studioPage() {
  if (!guard()) return;
  loading();
  let courses;
  try { [{ courses }, { categories: cats }] = await Promise.all([get('/api/studio/courses'), get('/api/categories')]); } catch (e) { return errorView(e); }
  app().innerHTML = `<section class="wrap">${head(t('studio'), `<button class="btn btn-accent" id="newc">${ic('plus')}${t('new_course')}</button>`)}${subnav()}
  ${courses.length ? `<div class="sc-list sec">${courses.map(c => `<div class="sc">${cover(c)}<div style="min-width:0"><h3>${esc(L(c.title))}</h3>
    <div class="meta" style="margin-top:6px">${badge(c.status)}<span>${money(c.price)}</span><span>${fmt(c.lessons)} ${t('lessons_n')}</span><span>${fmt(c.enrolledCount)} ${t('learners_n')}</span><span>${egp(c.earned)} ${t('earned')}</span></div></div>
    <div class="actions"><a class="btn btn-ghost" href="/courses/${c.slug}">${t('view_page')}</a><a class="btn btn-brand" href="/studio/courses/${c.id}">${t('edit')}</a></div></div>`).join('')}</div>`
    : `<div class="empty sec"><p>${t('no_courses_studio')}</p></div>`}</section>${footer()}`;
  $('#newc').addEventListener('click', newCourseModal);
}

function newCourseModal() {
  openModal(`<h2>${t('new_course')}</h2><form id="ncf" novalidate>
    ${field('title_en', t('title'), 'required minlength="4" maxlength="120"')}
    <div class="row2"><div class="field"><label for="f-category">${t('category')}</label><select id="f-category" name="category">${cats.map(c => `<option value="${c.key}">${esc(L(c.name))}</option>`).join('')}</select></div>
    <div class="field"><label for="f-level">${t('level')}</label><select id="f-level" name="level">${LEVELS.map(l => `<option value="${l}">${t('lv_' + l)}</option>`).join('')}</select></div></div>
    ${field('price', t('price_egp'), 'type="number" min="0" max="20000" step="1" value="0" required')}
    <div class="form-msg"></div>
    <div class="mrow"><button class="btn btn-ghost" type="button" data-close>${t('cancel')}</button><button class="btn btn-accent" type="submit">${t('create')}</button></div></form>`);
  bindForm($('#ncf'), async v => {
    const { course } = await post('/api/studio/courses', { ...v, price: Number(v.price) });
    closeModal();
    navigate(`/studio/courses/${course.id}`);
  });
}

/* ---------- course editor ---------- */
let E = null, dirty = false;
const warn = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}
const markDirty = () => { dirty = true; const s = $('#savestate'); if (s) s.textContent = t('unsaved'); };

export async function editorPage(m) {
  if (!guard()) return;
  loading();
  try { [{ course: E }, { categories: cats }] = await Promise.all([get(`/api/studio/courses/${m[1]}`), get('/api/categories')]); } catch (e) { return errorView(e); }
  dirty = false;
  window.addEventListener('beforeunload', warn);
  onLeave(() => window.removeEventListener('beforeunload', warn));
  renderEditor();
}

const inp = (k, v, attrs = '') => `<input data-k="${k}" value="${esc(v ?? '')}" ${attrs}>`;

function lessonRow(si, li, l) {
  const k = `sections.${si}.lessons.${li}`;
  return `<div class="les-row" style="border-top:${li ? '1px dashed var(--line)' : '0'};padding-top:${li ? '8px' : '0'}">
    <div class="les-row" style="flex:1 1 100%">${inp(`${k}.title_en`, l.title_en, `placeholder="${t('lesson_title')}" aria-label="${t('lesson_title')}" maxlength="140"`)}${inp(`${k}.title_ar`, l.title_ar, `placeholder="${t('lesson_title_ar')}" aria-label="${t('lesson_title_ar')}" dir="rtl" maxlength="140"`)}
    ${inp(`${k}.minutes`, l.minutes, `class="mins" type="number" min="1" max="600" aria-label="${t('minutes')}" title="${t('minutes')}"`)}</div>
    <div class="les-row" style="flex:1 1 100%"><select data-k="${k}.video_provider" aria-label="${t('video_source')}" style="flex:0 1 240px"><option value="url" ${l.video_provider !== 'bunny' ? 'selected' : ''}>${t('src_url')}</option><option value="bunny" ${l.video_provider === 'bunny' ? 'selected' : ''}>${t('src_bunny')}</option></select>
    ${l.video_provider === 'bunny' ? inp(`${k}.video_ref`, l.video_ref, `placeholder="${t('bunny_id')}" aria-label="${t('bunny_id')}" dir="ltr"`) : inp(`${k}.video_url`, l.video_url, `type="url" placeholder="${t('video_link')}" aria-label="${t('src_url')}" dir="ltr"`)}
    <label class="chk"><input type="checkbox" data-k="${k}.is_preview" ${l.is_preview ? 'checked' : ''}>${t('preview_lesson')}</label>
    <span class="actions" style="margin-inline-start:auto"><button type="button" class="mini-btn" data-act="lup" data-s="${si}" data-l="${li}" aria-label="${t('move_up')}">${ic('up')}</button><button type="button" class="mini-btn" data-act="ldown" data-s="${si}" data-l="${li}" aria-label="${t('move_down')}">${ic('down')}</button><button type="button" class="mini-btn danger" data-act="ldel" data-s="${si}" data-l="${li}" aria-label="${t('remove')}">${ic('trash')}</button></span></div>
  </div>`;
}

function renderEditor() {
  const c = E;
  app().innerHTML = `<section class="wrap">${head(esc(c.title_en), `<span id="savestate" class="muted">${dirty ? t('unsaved') : ''}</span>`)}${subnav()}
  <div class="ed sec">
    <div>
      <div class="box"><h2>${t('basics')}</h2>
        <div class="row2"><div class="field"><label>${t('title')}</label>${inp('title_en', c.title_en, 'maxlength="120"')}</div><div class="field"><label>${t('title_ar')}</label>${inp('title_ar', c.title_ar, 'dir="rtl" maxlength="120"')}</div></div>
        <div class="row2"><div class="field"><label>${t('summary')}</label><textarea data-k="summary_en" maxlength="400">${esc(c.summary_en)}</textarea></div><div class="field"><label>${t('summary_ar')}</label><textarea data-k="summary_ar" dir="rtl" maxlength="400">${esc(c.summary_ar)}</textarea></div></div>
        <div class="row2"><div class="field"><label>${t('category')}</label><select data-k="category">${cats.map(x => `<option value="${x.key}" ${x.key === c.category ? 'selected' : ''}>${esc(L(x.name))}</option>`).join('')}</select></div>
        <div class="field"><label>${t('level')}</label><select data-k="level">${LEVELS.map(l => `<option value="${l}" ${l === c.level ? 'selected' : ''}>${t('lv_' + l)}</option>`).join('')}</select></div></div>
        <div class="field" style="max-width:240px"><label>${t('price_egp')}</label>${inp('price', c.price, 'type="number" min="0" max="20000"')}</div>
      </div>
      <div class="box"><h2>${t('curriculum')}</h2>
        ${c.sections.map((s, si) => `<div class="sec-ed"><div class="sec-ed-h"><b class="tnum">${fmt(si + 1)}</b>${inp(`sections.${si}.title_en`, s.title_en, `placeholder="${t('section_title')}" aria-label="${t('section_title')}" maxlength="120"`)}${inp(`sections.${si}.title_ar`, s.title_ar, `placeholder="${t('section_title_ar')}" aria-label="${t('section_title_ar')}" dir="rtl" maxlength="120"`)}
          <span class="actions"><button type="button" class="mini-btn" data-act="sup" data-s="${si}" aria-label="${t('move_up')}">${ic('up')}</button><button type="button" class="mini-btn" data-act="sdown" data-s="${si}" aria-label="${t('move_down')}">${ic('down')}</button><button type="button" class="mini-btn danger" data-act="sdel" data-s="${si}" aria-label="${t('remove')}">${ic('trash')}</button></span></div>
          <div class="les-ed">${s.lessons.map((l, li) => lessonRow(si, li, l)).join('')}<div><button type="button" class="mini-btn" data-act="ladd" data-s="${si}">${ic('plus')}${t('add_lesson')}</button></div></div></div>`).join('')}
        <button type="button" class="btn btn-ghost" style="margin-top:14px" data-act="sadd">${ic('plus')}${t('add_section')}</button>
      </div>
      <div class="box"><h2>${t('checkpoint_q')}</h2>
        ${c.quiz.map((q, qi) => `<div class="q-ed"><div class="les-row"><b class="tnum">${fmt(qi + 1)}.</b>${inp(`quiz.${qi}.prompt`, q.prompt, `placeholder="${t('question')}" aria-label="${t('question')}" maxlength="300"`)}<button type="button" class="mini-btn danger" data-act="qdel" data-q="${qi}" aria-label="${t('remove')}">${ic('trash')}</button></div>
          ${q.options.map((o, oi) => `<div class="q-opt"><input type="radio" name="ans${qi}" data-ans="${qi}" value="${oi}" ${q.answer === oi ? 'checked' : ''} aria-label="${t('correct')}" title="${t('correct')}">${inp(`quiz.${qi}.options.${oi}`, o, `placeholder="${t('option')} ${oi + 1}" maxlength="200"`)}${q.options.length > 2 ? `<button type="button" class="mini-btn danger" data-act="odel" data-q="${qi}" data-o="${oi}" aria-label="${t('remove')}">${ic('x')}</button>` : ''}</div>`).join('')}
          ${q.options.length < 6 ? `<div><button type="button" class="mini-btn" data-act="oadd" data-q="${qi}">${ic('plus')}${t('add_option')}</button></div>` : ''}</div>`).join('')}
        <button type="button" class="btn btn-ghost" style="margin-top:14px" data-act="qadd">${ic('plus')}${t('add_question')}</button>
      </div>
    </div>
    <aside class="ed-side">
      <div class="box"><div class="kv"><span class="muted">${t('status')}</span>${badge(c.status)}</div><div class="kv"><span class="muted">${t('learners_n')}</span><b>${fmt(c.stats.learners)}</b></div><div class="kv"><span class="muted">${t('earned')}</span><b>${egp(c.stats.earned)}</b></div>
        <div style="display:grid;gap:8px;margin-top:14px"><button class="btn btn-accent" id="save">${t('save_changes')}</button>
        ${c.status === 'published' ? `<button class="btn btn-ghost" id="unpub">${t('unpublish')}</button>` : `<button class="btn btn-brand" id="pub">${t('publish')}</button>`}
        <a class="btn btn-ghost" href="/courses/${c.slug}" target="_blank" rel="noopener">${t('view_page')}</a></div>
        <div class="form-msg" id="edmsg"></div></div>
      ${c.problems.length ? `<div class="box"><h3 style="font-size:1rem;margin-bottom:8px">${t('problems_title')}</h3><ul class="problems">${c.problems.map(p => `<li>${esc(tErr(p))}</li>`).join('')}</ul></div>` : ''}
    </aside>
  </div></section>${footer()}`;

  $$('[data-k]').forEach(el => {
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const k = el.dataset.k;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'price' || k.endsWith('.minutes')) v = Number(v);
      setPath(E, k, v);
      markDirty();
      if (k.endsWith('.video_provider')) renderEditor();
    });
  });
  $$('[data-ans]').forEach(el => el.addEventListener('change', () => { E.quiz[Number(el.dataset.ans)].answer = Number(el.value); markDirty(); }));
  $$('[data-act]').forEach(b => b.addEventListener('click', () => structural(b.dataset)));
  $('#save').addEventListener('click', save);
  $('#pub')?.addEventListener('click', () => setStatus('published'));
  $('#unpub')?.addEventListener('click', () => setStatus('draft'));
}

const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
function structural(d) {
  const s = Number(d.s), l = Number(d.l), q = Number(d.q);
  const S = E.sections;
  switch (d.act) {
    case 'sadd': S.push({ title_en: '', title_ar: '', lessons: [{ title_en: '', title_ar: '', minutes: 10, is_preview: false, video_provider: 'url', video_url: '', video_ref: '' }] }); break;
    case 'sup': swap(S, s, s - 1); break;
    case 'sdown': swap(S, s, s + 1); break;
    case 'sdel': if (!confirm(t('confirm_remove'))) return; S.splice(s, 1); break;
    case 'ladd': S[s].lessons.push({ title_en: '', title_ar: '', minutes: 10, is_preview: false, video_provider: 'url', video_url: '', video_ref: '' }); break;
    case 'lup': if (l > 0) swap(S[s].lessons, l, l - 1); else if (s > 0) S[s - 1].lessons.push(S[s].lessons.shift()); break;
    case 'ldown': if (l < S[s].lessons.length - 1) swap(S[s].lessons, l, l + 1); else if (s < S.length - 1) S[s + 1].lessons.unshift(S[s].lessons.pop()); break;
    case 'ldel': if (!confirm(t('confirm_remove'))) return; S[s].lessons.splice(l, 1); break;
    case 'qadd': E.quiz.push({ prompt: '', options: ['', ''], answer: 0 }); break;
    case 'qdel': E.quiz.splice(q, 1); break;
    case 'oadd': E.quiz[q].options.push(''); break;
    case 'odel': { const Q = E.quiz[q]; Q.options.splice(Number(d.o), 1); if (Q.answer >= Q.options.length) Q.answer = 0; break; }
    default: return;
  }
  markDirty();
  renderEditor();
}

const payload = () => ({
  title_en: E.title_en, title_ar: E.title_ar, summary_en: E.summary_en, summary_ar: E.summary_ar,
  category: E.category, level: E.level, price: E.price,
  sections: E.sections.map(s => ({ id: s.id, title_en: s.title_en, title_ar: s.title_ar, lessons: s.lessons.map(l => ({ ...l })) })),
  quiz: E.quiz,
});
function showMsg(text, ok) { const m = $('#edmsg'); if (m) { m.className = `form-msg ${ok ? 'form-ok' : 'form-err'}`; m.textContent = text; } }

async function save() {
  const b = $('#save'); b.disabled = true;
  try {
    E = (await put(`/api/studio/courses/${E.id}`, payload())).course;
    dirty = false;
    renderEditor();
    showMsg(t('saved_changes'), true);
    return true;
  } catch (e) { showMsg(tErr(e.message), false); b.disabled = false; return false; }
}
async function setStatus(status) {
  if (dirty && !(await save())) return;
  try {
    E = (await post(`/api/studio/courses/${E.id}/status`, { status })).course;
    renderEditor();
    toast(status === 'published' ? t('published_ok') : t('unpublished_ok'));
  } catch (e) { showMsg(tErr(e.message), false); }
}

/* ---------- earnings & payouts ---------- */
export async function earningsPage() {
  if (!guard()) return;
  loading();
  let d;
  try { d = await get('/api/studio/earnings'); } catch (e) { return errorView(e); }
  const b = d.balance;
  const max = Math.max(1, ...d.months.map(m => m.amount));
  const monthName = m => new Date(m + '-15T00:00:00Z').toLocaleDateString(store.lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short' });
  app().innerHTML = `<section class="wrap">${head(t('earnings'))}${subnav()}
  <div class="tiles">
    <div class="tile"><span class="ti hot">${ic('coin')}</span><div><b>${egp(Math.max(0, b.available))}</b><span>${t('available')}</span></div></div>
    <div class="tile"><span class="ti">${ic('layers')}</span><div><b>${egp(b.earned)}</b><span>${t('total_earned')}</span></div></div>
    <div class="tile"><span class="ti">${ic('check')}</span><div><b>${egp(b.paidOut)}</b><span>${t('paid_out')}</span></div></div>
    <div class="tile"><span class="ti">${ic('clock')}</span><div><b>${egp(b.requested)}</b><span>${t('requested')}</span></div></div>
  </div>
  <p class="notice">${ic('info')}<span>${t('your_share', { n: fmt(Math.round(d.share * 100)) })}</span></p>
  <div class="dash-grid sec">
    <div>
      <div class="panel"><h3>${t('monthly')}</h3>${d.months.length ? `<div class="bars">${d.months.map(m => `<div><b class="tnum">${fmt(m.amount)}</b><i style="height:${Math.max(2, m.amount / max * 100)}%"></i><small>${monthName(m.month)}</small></div>`).join('')}</div>` : `<p class="muted">${t('no_ledger')}</p>`}</div>
      <h2 style="margin-top:24px">${t('ledger')}</h2>
      ${d.ledger.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>${t('date')}</th><th>${t('course')}</th><th>${t('order')}</th><th class="num">${t('price')}</th><th class="num">${t('share')}</th><th class="num">${t('you_get')}</th></tr></thead><tbody>
        ${d.ledger.map(e => `<tr><td>${date(e.createdAt)}</td><td>${esc(L(e.course.title))} ${e.kind === 'refund' ? `<span class="st-badge st-refunded">${t('refund')}</span>` : ''}</td><td>#${fmt(e.orderId)}</td><td class="num">${egp(Math.abs(e.gross))}</td><td class="num">${fmt(Math.round(e.share * 100))}%</td><td class="num" style="color:${e.amount < 0 ? 'var(--bad)' : 'inherit'}">${e.amount < 0 ? '-' : ''}${egp(Math.abs(e.amount))}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty"><p>${t('no_ledger')}</p></div>`}
    </div>
    <div>
      <form class="panel" id="payf" novalidate><h3>${t('request_payout')}</h3>
        ${field('amount', t('amount'), `type="number" min="${d.minPayout}" max="${Math.max(d.minPayout, b.available)}" step="1" value="${Math.max(0, b.available)}" required`, t('min_payout', { n: egp(d.minPayout) }))}
        <div class="field"><label for="f-method">${t('method')}</label><select id="f-method" name="method"><option value="instapay">${t('m_instapay')}</option><option value="bank">${t('m_bank')}</option><option value="wallet">${t('m_wallet')}</option></select></div>
        <div class="field"><label for="f-details">${t('details')}</label><textarea id="f-details" name="details" rows="3" maxlength="300" required></textarea><span class="hint">${t('details_hint')}</span></div>
        <div class="form-msg"></div>
        <button class="btn btn-accent btn-block" type="submit" style="margin-top:14px" ${b.available < d.minPayout ? 'disabled' : ''}>${t('request_payout')}</button></form>
      <div class="panel"><h3>${t('payout_history')}</h3>
        ${d.payouts.length ? d.payouts.map(p => `<div class="kv"><span><b class="tnum">${egp(p.amount)}</b><br><small class="muted">${date(p.requestedAt)} · ${t('m_' + p.method)}</small>${p.note ? `<br><small class="muted">${esc(p.note)}</small>` : ''}</span>${badge(p.status)}</div>`).join('') : `<p class="muted">${t('no_payouts')}</p>`}</div>
    </div>
  </div></section>${footer()}`;
  bindForm($('#payf'), async (v, form) => {
    await post('/api/studio/payouts', { ...v, amount: Number(v.amount) });
    okMsg(form, t('payout_sent'));
    setTimeout(earningsPage, 900);
  });
}
