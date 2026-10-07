// Lesson Q&A, course news and live sessions (learner side).
import { store, t, tErr, esc, fmt, L, date } from './state.js';
import { get, post } from './api.js';
import { ic } from './icons.js';
import { $, bindForm, toast } from './ui.js';

const when = iso => new Date(iso).toLocaleString(store.lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ---------- live sessions ---------- */
const icsDate = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');

/** Build and download an .ics calendar file for a session. */
export function downloadIcs(s) {
  const end = new Date(new Date(s.startsAt).getTime() + s.minutes * 60_000);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Manhal//Live sessions//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:manhal-live-${s.id}@manhal`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(s.startsAt)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(`${s.title} (${L(s.course.title)})`)}`, `DESCRIPTION:${icsText(s.link ? `${t('join_link')}: ${s.link}` : L(s.course.title))}`,
    ...(s.link ? [`URL:${s.link}`] : []), 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(s.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `manhal-live-${s.id}.ics` });
  a.dataset.external = '';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function liveHTML(sessions, { showCourse = false } = {}) {
  if (!sessions.length) return '';
  return `<div class="lives">${sessions.map(s => `<div class="live">
    <span class="lv-ic">${ic('live')}</span>
    <div style="min-width:0"><b>${esc(s.title)}</b><small class="muted">${showCourse ? `${esc(L(s.course.title))} · ` : ''}${when(s.startsAt)} · ${fmt(s.minutes)} ${t('min')}</small></div>
    <div class="actions"><button class="mini-btn" data-ics="${s.id}">${ic('cal')}${t('add_calendar')}</button>${s.link ? `<a class="mini-btn" href="${esc(s.link)}" target="_blank" rel="noopener" data-external>${t('join')}</a>` : ''}</div></div>`).join('')}</div>`;
}
export function wireLive(root, sessions) {
  root.querySelectorAll('[data-ics]').forEach(b => b.addEventListener('click', () => downloadIcs(sessions.find(s => s.id === Number(b.dataset.ics)))));
}

/* ---------- Q&A ---------- */
const answerHTML = a => {
  const label = a.kind === 'ai'
    ? (a.checkedBy ? `<span class="ai-badge">AI</span> ${t('nour')} · ${t('checked_by', { name: esc(a.checkedBy) })}` : `<span class="ai-badge">AI</span> ${t('ai_unchecked')}`)
    : `${t('instructor_answer')} · ${esc(a.author || '')}`;
  return `<div class="ans ${a.kind === 'ai' ? (a.checkedBy ? 'ai checked' : 'ai') : ''}"><div class="ans-h">${label}</div><p>${esc(a.body).replace(/\n/g, '<br>')}</p>
    ${a.citations?.length ? `<div class="ncites">${t('from')}: ${a.citations.map(c => `<span>${t('lesson_n', { n: fmt(c.n) })} – ${esc(L(c.title))}</span>`).join('')}</div>` : ''}</div>`;
};
export const questionHTML = q => `<article class="qa">
  <div class="qa-h"><b>${esc(q.title)}</b><small class="muted">${esc(q.asker || '')} · ${date(q.createdAt)}</small></div>
  ${q.body ? `<p class="muted">${esc(q.body)}</p>` : ''}
  ${q.answers.length ? q.answers.map(answerHTML).join('') : `<p class="qa-wait">${t('awaiting_answer')}</p>`}</article>`;

/** The Q&A tab for one lesson. `prefill` comes from Nour's "Ask the instructor" button. */
export async function renderQA(el, { course, lessonId, canAsk, prefill = '' }) {
  el.innerHTML = '<div class="spin" style="margin:20px auto"></div>';
  let questions;
  try { ({ questions } = await get(`/api/courses/${course.id}/questions?lesson=${lessonId}`)); } catch (e) { el.innerHTML = `<p class="muted">${esc(tErr(e.message))}</p>`; return; }
  el.innerHTML = `${canAsk ? `<form class="box qa-form" id="qaf" novalidate><h3>${t('ask_question')}</h3>
      <div class="field"><label for="f-qt">${t('your_question')}</label><input id="f-qt" name="title" required minlength="5" maxlength="200" value="${esc(prefill.slice(0, 200))}"></div>
      <div class="field"><label for="f-qb">${t('details_opt')}</label><textarea id="f-qb" name="body" rows="3" maxlength="3000"></textarea></div>
      <p class="hint" style="font-size:.8rem;margin-top:8px">${t('qa_ai_hint')}</p>
      <div class="form-msg"></div><button class="btn btn-brand" type="submit" style="margin-top:10px">${t('post_question')}</button></form>` : ''}
    <div class="qa-list">${questions.length ? questions.map(questionHTML).join('') : `<p class="muted">${t('no_questions')}</p>`}</div>`;
  if (canAsk) {
    bindForm($('#qaf', el), async v => {
      await post(`/api/courses/${course.id}/questions`, { lessonId, title: v.title, body: v.body });
      toast(t('question_posted'));
      renderQA(el, { course, lessonId, canAsk });
    });
    if (prefill) $('#f-qt', el).focus();
  }
}

export async function renderNews(el, course) {
  el.innerHTML = '<div class="spin" style="margin:20px auto"></div>';
  try {
    const [{ announcements }, { sessions }] = await Promise.all([get(`/api/courses/${course.id}/news`), get(`/api/courses/${course.id}/live`)]);
    el.innerHTML = `${sessions.length ? `<h3 class="sub-h">${t('live_sessions')}</h3>${liveHTML(sessions)}` : ''}
      <h3 class="sub-h">${t('announcements')}</h3>
      ${announcements.length ? announcements.map(a => `<article class="news"><div class="qa-h"><b>${esc(a.title)}</b><small class="muted">${date(a.createdAt)}</small></div><p>${esc(a.body).replace(/\n/g, '<br>')}</p></article>`).join('') : `<p class="muted">${t('no_news')}</p>`}`;
    wireLive(el, sessions);
  } catch (e) { el.innerHTML = `<p class="muted">${esc(tErr(e.message))}</p>`; }
}
