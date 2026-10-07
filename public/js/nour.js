// "Ask Nour": the AI study mentor panel in the lesson player.
import { store, t, tErr, esc, fmt, L, date } from './state.js';
import { get, post, del, stream } from './api.js';
import { ic } from './icons.js';
import { $, $$, openModal, closeModal, toast, toastErr } from './ui.js';

const MODE_LABEL = { explain: 'nour_explain', example: 'nour_example', quiz: 'nour_quiz', more: 'nour_more' };
let S = null; // { el, course, lessonId, data, busy, onAsk }

/** Escape, then format: line breaks, numbered lines, `code`, **bold** and [L12] lesson markers. */
function format(text, citations = []) {
  const byId = new Map(citations.map(c => [c.id, c]));
  return esc(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/\[L(\d+)\]/g, (_, id) => {
      const c = byId.get(Number(id));
      return c ? `<a class="cite" href="/learn/${S.course.slug}/lesson/${c.id}" title="${esc(L(c.title))}">${fmt(c.n)}</a>` : '';
    })
    // Each line picks its own direction, so English lesson text reads correctly inside an Arabic reply.
    .split('\n').map(line => (line.trim() ? `<div dir="auto">${line}</div>` : '<div class="nsp"></div>')).join('');
}

const avatar = () => `<span class="nour-av" aria-hidden="true">${ic('spark')}</span>`;
const aiTag = () => `<span class="ai-badge" title="${t('ai_badge_title')}">AI</span>`;

function msgHTML(m, last) {
  if (m.role === 'user') return `<div class="nm user"><div class="nb" dir="auto">${m.text ? esc(m.text) : `<i>${t(MODE_LABEL[m.mode] || 'nour_explain')}</i>`}</div></div>`;
  const cites = m.citations?.length ? `<div class="ncites">${t('from')}: ${m.citations.map(c => `<a href="/learn/${S.course.slug}/lesson/${c.id}">${t('lesson_n', { n: fmt(c.n) })} – ${esc(L(c.title))}</a>`).join('')}</div>` : '';
  const ask = m.kind === 'not_covered' ? `<button class="btn btn-ghost nsmall" data-nask="${m.id}">${ic('chat')}${t('ask_instructor')}</button>` : '';
  const tools = m.kind === 'care' ? '' : `<div class="ntools">
    <button class="nt-b ${m.rating === 1 ? 'on' : ''}" data-nrate="${m.id}" data-v="1" aria-label="${t('helpful')}" aria-pressed="${m.rating === 1}">${ic('up_t')}</button>
    <button class="nt-b ${m.rating === -1 ? 'on' : ''}" data-nrate="${m.id}" data-v="-1" aria-label="${t('unhelpful')}" aria-pressed="${m.rating === -1}">${ic('down_t')}</button>
    <button class="nt-b" data-nreport="${m.id}" aria-label="${t('report_reply')}" title="${t('report_reply')}">${ic('flag')}</button>
    ${last && m.kind === 'answer' ? `<button class="nt-more" data-nmode="more">${t('nour_more')}</button>` : ''}</div>`;
  return `<div class="nm bot ${m.kind === 'care' ? 'care' : ''}">${avatar()}<div class="nb"><div class="nwho"><b>${t('nour')}</b>${aiTag()}</div><div class="ntext" dir="auto">${format(m.text, m.citations)}</div>${cites}${ask}${tools}</div></div>`;
}

function introHTML() {
  return `<div class="nm bot intro">${avatar()}<div class="nb"><div class="nwho"><b>${t('nour')}</b>${aiTag()}</div>
    <div class="ntext">${t('nour_intro', { name: esc((store.me?.name || '').split(' ')[0]) })}</div>
    ${store.mentor.demo ? `<div class="ndemo">${ic('info', 'sm')}${t('nour_demo_note')}</div>` : ''}</div></div>`;
}

function quotaText(q) {
  return q.remaining > 0 ? t('nour_left', { n: fmt(q.remaining), limit: fmt(q.limit) }) : t('nour_none_left');
}

function render() {
  const d = S.data;
  const log = d.messages.length ? d.messages.map((m, i) => msgHTML(m, i === d.messages.length - 1)).join('') : introHTML();
  S.el.innerHTML = `<div class="nour">
    <div class="nour-h">${avatar()}<div style="min-width:0"><b>${t('nour')}</b> ${aiTag()}<small>${t('nour_role')}</small></div>
      ${d.messages.length ? `<button class="mini-btn" data-nclear>${ic('trash')}${t('clear_history')}</button>` : ''}</div>
    ${S.lessonId ? `<div class="nour-modes" role="group" aria-label="${t('nour_modes')}">
      <button class="chip" data-nmode="explain">${t('nour_explain')}</button><button class="chip" data-nmode="example">${t('nour_example')}</button><button class="chip" data-nmode="quiz">${t('nour_quiz')}</button></div>` : ''}
    <div class="nour-log" id="nlog" aria-live="polite">${log}</div>
    <form class="nour-in" id="nform"><label class="sr" for="nq">${t(S.lessonId ? 'nour_ph' : 'nour_ph_quiz')}</label>
      <textarea id="nq" rows="2" maxlength="1500" placeholder="${t(S.lessonId ? 'nour_ph' : 'nour_ph_quiz')}" ${S.busy ? 'disabled' : ''}></textarea>
      <div class="nour-foot"><small class="muted" id="nquota">${quotaText(d.quota)}</small><button class="btn btn-accent nsend" type="submit" ${S.busy ? 'disabled' : ''}>${ic('send', 'flip')}<span>${t('send')}</span></button></div></form>
    <p class="nour-note">${t('nour_disclaimer')}</p></div>`;
  const log2 = $('#nlog', S.el); log2.scrollTop = log2.scrollHeight;
  const q = $('#nq', S.el);
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#nform', S.el).requestSubmit(); } });
  $('#nform', S.el).addEventListener('submit', e => { e.preventDefault(); const v = q.value.trim(); if (v) send(v, 'explain'); });
}

function limitMessage(err) {
  const d = err.data || {};
  if (d.code === 'daily_limit') {
    const at = new Date(d.resetAt).toLocaleTimeString(store.lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${t('nour_limit', { time: at })}${d.plus ? '' : ` ${t('nour_limit_plus')}`}`;
  }
  return tErr(err.message);
}

async function send(text, mode) {
  if (S.busy) return;
  S.busy = true;
  const log = $('#nlog', S.el);
  if (!S.data.messages.length) log.innerHTML = '';
  log.insertAdjacentHTML('beforeend', `<div class="nm user"><div class="nb" dir="auto">${text ? esc(text) : `<i>${t(MODE_LABEL[mode])}</i>`}</div></div>
    <div class="nm bot" id="nlive">${avatar()}<div class="nb"><div class="nwho"><b>${t('nour')}</b>${aiTag()}</div><div class="ntext"><span class="typing"><i></i><i></i><i></i></span></div></div></div>`);
  log.scrollTop = log.scrollHeight;
  $$('textarea, .nsend', S.el).forEach(x => { x.disabled = true; });
  let draft = '';
  try {
    await stream('/api/mentor/ask', { courseId: S.course.id, lessonId: S.lessonId || undefined, text, mode }, ev => {
      const live = $('#nlive .ntext', S.el);
      if (ev.type === 'start') S.data.messages.push(ev.userMessage);
      else if (ev.type === 'delta' && live) {
        draft += ev.text;
        live.innerHTML = format(draft.replace(/\[L\d+\]/g, ''));
        log.scrollTop = log.scrollHeight;
      } else if (ev.type === 'done') {
        S.data.messages.push(ev.message);
        S.data.quota = ev.quota;
      } else if (ev.type === 'error') {
        S.data.messages.pop();
        if (live) live.innerHTML = `<span class="nerr">${esc(tErr(ev.error))}</span>`;
        throw Object.assign(new Error(ev.error), { shown: true });
      }
    });
    S.busy = false;
    render();
  } catch (err) {
    S.busy = false;
    const live = $('#nlive', S.el);
    if (!err.shown && live) $('.ntext', live).innerHTML = `<span class="nerr">${esc(limitMessage(err))}</span>`;
    if (live) live.removeAttribute('id');
    $$('textarea, .nsend', S.el).forEach(x => { x.disabled = false; });
    if (err.status === 429 && err.data?.code === 'daily_limit') $('#nquota', S.el).textContent = t('nour_none_left');
  }
}

function report(id) {
  openModal(`<h2>${t('report_reply')}</h2><p class="muted" style="margin-top:6px">${t('report_sub')}</p><form id="rpf">
    <div class="field"><label for="rp">${t('report_reason')}</label><select id="rp" name="reason">
      ${['report_wrong', 'report_unsafe', 'report_answer', 'report_other'].map(k => `<option value="${t(k)}">${t(k)}</option>`).join('')}</select></div>
    <div class="field"><label for="rpd">${t('details_opt')}</label><textarea id="rpd" name="details" rows="3" maxlength="400"></textarea></div>
    <div class="mrow"><button class="btn btn-ghost" type="button" data-close>${t('cancel')}</button><button class="btn btn-accent" type="submit">${t('send_report')}</button></div></form>`);
  $('#rpf').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await post(`/api/mentor/messages/${id}/report`, { reason: `${f.reason.value}${f.details.value.trim() ? `: ${f.details.value.trim()}` : ''}` });
      closeModal(); toast(t('report_thanks'));
    } catch (err) { toastErr(err); }
  });
}

/** Clicks inside the panel (delegated from the player). */
async function onClick(e) {
  if (!S) return;
  const b = e.target.closest('[data-nmode],[data-nrate],[data-nreport],[data-nclear],[data-nask]');
  if (!b || !S.el.contains(b)) return;
  const d = b.dataset;
  if (d.nmode) send('', d.nmode);
  else if (d.nrate) {
    const m = S.data.messages.find(x => x.id === Number(d.nrate));
    const v = m.rating === Number(d.v) ? 0 : Number(d.v);
    try { await post(`/api/mentor/messages/${m.id}/rate`, { value: v }); m.rating = v || null; render(); } catch (err) { toastErr(err); }
  } else if (d.nreport) report(Number(d.nreport));
  else if ('nclear' in d) {
    if (!confirm(t('clear_confirm'))) return;
    try { await del(`/api/mentor/courses/${S.course.id}`); S.data.messages = []; render(); toast(t('history_cleared')); } catch (err) { toastErr(err); }
  } else if (d.nask) {
    const i = S.data.messages.findIndex(x => x.id === Number(d.nask));
    const q = [...S.data.messages.slice(0, i)].reverse().find(x => x.role === 'user' && x.text);
    S.onAsk?.(q?.text || '');
  }
}

/** Mount the panel. opts: { course, lessonId, onAsk(text) } */
export async function mountNour(el, { course, lessonId, onAsk }) {
  if (!S || S.course.id !== course.id) {
    S = { el, course, lessonId, onAsk, busy: false, data: null };
    el.innerHTML = '<div class="spin" style="margin:24px auto"></div>';
    try { S.data = await get(`/api/mentor/courses/${course.id}`); } catch (e) { el.innerHTML = `<p class="muted">${esc(tErr(e.message))}</p>`; S = null; return; }
  } else Object.assign(S, { el, lessonId, onAsk, busy: false });
  if (!S.data.available) { el.innerHTML = `<div class="empty"><p>${t('nour_unavailable')}</p></div>`; return; }
  if (!el.dataset.wired) { el.addEventListener('click', onClick); el.dataset.wired = '1'; }
  render();
}
export const resetNour = () => { S = null; };

/** Account page: conversations the learner can review and delete. */
export async function nourHistoryHTML() {
  const { conversations } = await get('/api/mentor/history');
  if (!conversations.length) return `<p class="muted">${t('no_history')}</p>`;
  return `<div class="kvlist">${conversations.map(c => `<div class="kv"><span><b>${esc(L(c.course.title))}</b><br><small class="muted">${t('messages_n', { n: fmt(c.messages) })} · ${date(c.updatedAt)}</small></span>
    <span class="actions"><a class="mini-btn" href="/learn/${c.course.slug}?tab=nour">${t('open')}</a><button class="mini-btn danger" data-hdel="${c.course.id}">${ic('trash')}${t('delete')}</button></span></div>`).join('')}</div>
    <button class="btn btn-ghost" style="margin-top:12px" data-hdelall>${t('delete_all_history')}</button>`;
}
