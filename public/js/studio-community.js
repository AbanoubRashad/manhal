// Studio → Community: the questions inbox with Nour's drafts, live sessions and announcements.
import { store, t, esc, fmt, L, date } from './state.js';
import { get, post, put, del } from './api.js';
import { ic } from './icons.js';
import { app, $, $$, footer, loading, errorView, toast, toastErr, bindForm, field } from './ui.js';
import { guard, head, subnav } from './studio.js';

let C = null, tab = 'questions';

const cites = list => (list?.length ? `<div class="ncites">${t('from')}: ${list.map(c => `<span>${t('lesson_n', { n: fmt(c.n) })} – ${esc(L(c.title))}</span>`).join('')}</div>` : '');

function answerHTML(a) {
  if (a.kind === 'ai') {
    return `<div class="ans ai ${a.checkedBy ? 'checked' : ''}"><div class="ans-h"><span class="ai-badge">AI</span> ${a.checkedBy ? `${t('nour')} · ${t('checked_by', { name: esc(a.checkedBy) })}` : t('ai_unchecked')}</div>
      <p>${esc(a.body).replace(/\n/g, '<br>')}</p>${cites(a.citations)}
      <div class="actions" style="justify-content:flex-start;margin-top:8px">${a.checkedBy ? '' : `<button class="mini-btn" data-approve="${a.id}">${ic('check')}${t('approve')}</button>`}
      <button class="mini-btn" data-correct="${a.id}">${ic('pen')}${t('correct')}</button><button class="mini-btn danger" data-rmans="${a.id}">${ic('trash')}${t('remove')}</button></div>
      <form class="corr" data-corrf="${a.id}" hidden><textarea name="body" rows="4" maxlength="5000">${esc(a.body)}</textarea><button class="btn btn-brand nsmall" type="submit">${t('save_correction')}</button></form></div>`;
  }
  return `<div class="ans"><div class="ans-h">${t('instructor_answer')} · ${esc(a.author || '')}</div><p>${esc(a.body).replace(/\n/g, '<br>')}</p>${cites(a.citations)}</div>`;
}

function questionHTML(q) {
  const draft = q.draft ? `<div class="draft"><div class="ans-h"><span class="ai-badge">AI</span> ${t('nour_draft')}</div>
    <textarea data-draft="${q.id}" rows="4" maxlength="5000" aria-label="${t('nour_draft')}">${esc(q.draft.body)}</textarea>${cites(q.draft.citations)}
    <div class="actions" style="justify-content:flex-start;margin-top:8px"><button class="btn btn-brand nsmall" data-send="${q.id}">${t('send_as_is')}</button><button class="btn btn-ghost nsmall" data-sendedit="${q.id}">${t('edit_and_send')}</button><button class="btn btn-ghost nsmall" data-discard="${q.id}">${t('discard')}</button></div></div>` : '';
  const none = q.draftStatus === 'none' && !q.answers.length ? `<p class="hint" style="margin:8px 0">${ic('info', 'sm')} ${t('nour_no_draft')}</p>` : '';
  const form = !q.draft && !q.answers.length ? `<form class="ansf" data-ansf="${q.id}"><textarea name="body" rows="3" maxlength="5000" placeholder="${t('write_answer')}" aria-label="${t('write_answer')}"></textarea><button class="btn btn-brand nsmall" type="submit">${t('post_answer')}</button></form>` : '';
  return `<article class="qa box">
    <div class="qa-h"><b>${esc(q.title)}</b><small class="muted">${esc(q.asker)} · ${q.lesson ? `${t('lesson_n', { n: fmt(q.lesson.n) })} – ${esc(L(q.lesson.title))} · ` : ''}${date(q.createdAt)}</small></div>
    ${q.body ? `<p class="muted">${esc(q.body)}</p>` : ''}
    ${q.answers.map(answerHTML).join('')}${none}${draft}${form}</article>`;
}

function render() {
  const open = C.questions.filter(q => !q.answers.length).length;
  const tabs = [['questions', `${t('questions_tab')}${open ? ` (${fmt(open)})` : ''}`], ['live', t('live_sessions')], ['news', t('announcements')]];
  app().innerHTML = `<section class="wrap">${head(esc(L(C.course.title)), `<a class="btn btn-ghost" href="/studio/courses/${C.course.id}">${ic('pen')}${t('edit')}</a>`)}${subnav()}
  <nav class="subnav" style="margin-top:-12px" aria-label="${t('community')}">${tabs.map(([k, l]) => `<a href="#${k}" data-ctab="${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <div class="sec" id="cbody">${tab === 'questions' ? questionsView() : tab === 'live' ? liveView() : newsView()}</div></section>${footer()}`;
  $$('[data-ctab]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); tab = a.dataset.ctab; history.replaceState(null, '', `#${tab}`); render(); }));
  wire();
}

function questionsView() {
  return `<div class="box mode-box"><h2 style="font-size:1.1rem">${t('ai_answers')}</h2><p class="muted" style="margin:4px 0 10px">${t('ai_answers_sub')}</p>
    <label class="opt-card"><input type="radio" name="aimode" value="draft" ${C.mode === 'draft' ? 'checked' : ''}><span><b>${t('mode_draft')}</b><small class="muted">${t('mode_draft_d')}</small></span></label>
    <label class="opt-card"><input type="radio" name="aimode" value="instant" ${C.mode === 'instant' ? 'checked' : ''}><span><b>${t('mode_instant')}</b><small class="muted">${t('mode_instant_d')}</small></span></label></div>
  <div class="qa-list" style="margin-top:18px">${C.questions.length ? C.questions.map(questionHTML).join('') : `<div class="empty"><p>${t('no_questions_studio')}</p></div>`}</div>`;
}

function liveView() {
  const when = iso => new Date(iso).toLocaleString(store.lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="acct-grid"><form class="box" id="livef" novalidate><h2>${t('schedule_session')}</h2>
      ${field('title', t('session_title'), 'required minlength="3" maxlength="120"')}
      <div class="row2">${field('startsAt', t('starts_at'), 'type="datetime-local" required')}${field('minutes', t('length_min'), 'type="number" min="10" max="480" value="60" required')}</div>
      ${field('link', t('meeting_link'), 'type="url" required placeholder="https://" dir="ltr"', t('meeting_hint'))}
      <div class="form-msg"></div><button class="btn btn-accent" type="submit" style="margin-top:14px">${t('schedule')}</button></form>
    <div class="box"><h2>${t('live_sessions')}</h2><p class="muted" style="margin:4px 0 10px">${t('reminder_note')}</p>
      ${C.sessions.length ? C.sessions.map(s => `<div class="kv"><span><b>${esc(s.title)}</b><br><small class="muted">${when(s.startsAt)} · ${fmt(s.minutes)} ${t('min')}</small></span><button class="mini-btn danger" data-rmlive="${s.id}">${ic('trash')}</button></div>`).join('') : `<p class="muted">${t('no_sessions')}</p>`}</div></div>`;
}

function newsView() {
  return `<div class="acct-grid"><form class="box" id="newsf" novalidate><h2>${t('post_announcement')}</h2>
      ${field('title', t('title'), 'required minlength="3" maxlength="120"')}
      <div class="field"><label for="f-nb">${t('message')}</label><textarea id="f-nb" name="body" rows="5" required maxlength="3000"></textarea><span class="hint">${t('news_hint')}</span></div>
      <div class="form-msg"></div><button class="btn btn-accent" type="submit" style="margin-top:14px">${t('post')}</button></form>
    <div class="box"><h2>${t('announcements')}</h2>${C.announcements.length ? C.announcements.map(a => `<div class="news"><div class="qa-h"><b>${esc(a.title)}</b><small class="muted">${date(a.createdAt)}</small></div><p class="muted">${esc(a.body)}</p></div>`).join('') : `<p class="muted">${t('no_news')}</p>`}</div></div>`;
}

const reload = async () => { C = await get(`/api/studio/courses/${C.course.id}/community`); render(); };
const act = fn => async e => { e.preventDefault?.(); try { await fn(); await reload(); } catch (err) { toastErr(err); } };

function wire() {
  $$('[name=aimode]').forEach(r => r.addEventListener('change', act(async () => { await put(`/api/studio/courses/${C.course.id}/ai-mode`, { mode: r.value }); toast(t('saved')); })));
  $$('[data-send]').forEach(b => b.addEventListener('click', act(() => post(`/api/studio/questions/${b.dataset.send}/answer`, { fromDraft: true }))));
  $$('[data-sendedit]').forEach(b => b.addEventListener('click', act(() => post(`/api/studio/questions/${b.dataset.sendedit}/answer`, { fromDraft: true, body: $(`[data-draft="${b.dataset.sendedit}"]`).value }))));
  $$('[data-discard]').forEach(b => b.addEventListener('click', act(() => post(`/api/studio/questions/${b.dataset.discard}/discard`))));
  $$('[data-ansf]').forEach(f => f.addEventListener('submit', act(() => post(`/api/studio/questions/${f.dataset.ansf}/answer`, { body: f.body.value }))));
  $$('[data-approve]').forEach(b => b.addEventListener('click', act(() => post(`/api/studio/answers/${b.dataset.approve}/approve`))));
  $$('[data-correct]').forEach(b => b.addEventListener('click', () => { const f = $(`[data-corrf="${b.dataset.correct}"]`); f.hidden = !f.hidden; }));
  $$('[data-corrf]').forEach(f => f.addEventListener('submit', act(() => put(`/api/studio/answers/${f.dataset.corrf}`, { body: f.body.value }))));
  $$('[data-rmans]').forEach(b => b.addEventListener('click', act(async () => { if (confirm(t('confirm_remove'))) await del(`/api/studio/answers/${b.dataset.rmans}`); })));
  $$('[data-rmlive]').forEach(b => b.addEventListener('click', act(async () => { if (confirm(t('confirm_remove'))) await del(`/api/studio/live/${b.dataset.rmlive}`); })));
  const lf = $('#livef');
  if (lf) bindForm(lf, async v => { await post(`/api/studio/courses/${C.course.id}/live`, { ...v, minutes: Number(v.minutes), startsAt: new Date(v.startsAt).toISOString() }); toast(t('session_scheduled')); await reload(); });
  const nf = $('#newsf');
  if (nf) bindForm(nf, async v => { await post(`/api/studio/courses/${C.course.id}/news`, v); toast(t('posted')); await reload(); });
}

export async function communityPage(m) {
  if (!guard()) return;
  loading();
  tab = ['questions', 'live', 'news'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'questions';
  try { C = await get(`/api/studio/courses/${m[1]}/community`); } catch (e) { return errorView(e); }
  render();
}
