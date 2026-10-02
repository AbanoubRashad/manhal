import { store, t, esc, L, money, fmt } from '../state.js';
import { get, post } from '../api.js';
import { ic } from '../icons.js';
import { app, $, footer, bindForm, toast } from '../ui.js';

const SHARE = 0.7;

export async function teachPage() {
  let cats = [];
  try { cats = (await get('/api/categories')).categories; } catch { /* the form still works with a free-text topic */ }
  const me = store.me;
  const teacher = me && me.role !== 'learner';
  app().innerHTML = `<section class="wrap"><div class="teach-hero"><div class="eyebrow">${t('teach_eyebrow')}</div><h1>${t('teach_title')}</h1><p class="lede">${t('teach_sub')}</p>
    ${teacher ? `<div><a class="btn btn-accent" href="/studio">${t('go_studio')}</a></div>` : ''}</div>
  <div class="ben"><div><span class="ti">${ic('users')}</span><h3>${t('b1_t')}</h3><p>${t('b1_d')}</p></div><div><span class="ti">${ic('coin')}</span><h3>${t('b2_t')}</h3><p>${t('b2_d')}</p></div><div><span class="ti">${ic('layers')}</span><h3>${t('b3_t')}</h3><p>${t('b3_d')}</p></div></div>
  <div class="teach-grid sec">
    <div class="box calc"><h2>${t('calc_title')}</h2>
      <div class="rl"><label for="cp">${t('calc_price')}</label><output id="cpo"></output></div><input type="range" id="cp" min="199" max="1999" step="50" value="699">
      <div class="rl"><label for="cs">${t('calc_students')}</label><output id="cso"></output></div><input type="range" id="cs" min="10" max="500" step="10" value="120">
      <div class="out" id="cout"></div><div class="muted" id="cyear"></div><p class="muted" style="margin-top:14px;font-size:.85rem">${t('calc_share', { n: fmt(SHARE * 100) })}</p></div>
    <form class="box" id="tf" novalidate><h2>${t('apply_title')}</h2>
      <div class="field"><label for="tn">${t('f_name')}</label><input id="tn" name="name" required autocomplete="name" value="${esc(me?.name || '')}"></div>
      <div class="field"><label for="te">${t('f_email')}</label><input id="te" name="email" type="email" required autocomplete="email" value="${esc(me?.email || '')}"></div>
      <div class="field"><label for="tc">${t('f_topic')}</label><select id="tc" name="topic">${cats.map(c => `<option value="${esc(c.name.en)}">${esc(L(c.name))}</option>`).join('')}</select></div>
      <div class="form-msg"></div>
      <button class="btn btn-accent btn-block" style="margin-top:18px" type="submit">${t('f_submit')}</button></form>
  </div></section>${footer()}`;
  const upd = () => {
    const p = Number($('#cp').value), n = Number($('#cs').value), m = Math.round(p * n * SHARE);
    $('#cpo').textContent = money(p); $('#cso').textContent = fmt(n);
    $('#cout').textContent = money(m); $('#cyear').textContent = `${t('calc_month')} · ${money(m * 12)} ${t('calc_year')}`;
  };
  $('#cp').addEventListener('input', upd); $('#cs').addEventListener('input', upd); upd();
  bindForm($('#tf'), async (v, form) => {
    await post('/api/applications', v);
    toast(t('toast_teach'));
    form.reset();
  });
}
