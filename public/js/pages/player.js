import { store, t, tErr, esc, fmt, L } from '../state.js';
import { get, post, put } from '../api.js';
import { ic } from '../icons.js';
import { app, $, $$, loading, errorView, toast, toastErr, requireUser } from '../ui.js';
import { navigate, onLeave, current } from '../router.js';
import { mountNour, resetNour } from '../nour.js';
import { renderQA, renderNews } from '../community.js';
import { openCertificate } from './certificate.js';

let P = null;   // current player data
let V = null;   // simulated video state
let raf = null;

const ringHTML = p => {
  const r = 15, cf = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 38 38"><circle class="rt" cx="19" cy="19" r="${r}" fill="none" stroke-width="4"/><circle class="rv" cx="19" cy="19" r="${r}" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${cf}" stroke-dashoffset="${cf * (1 - p / 100)}"/></svg><span class="tnum">${fmt(p)}%</span></div>`;
};
const lessons = () => P.sections.flatMap((s, si) => s.lessons.map(l => ({ ...l, si, section: s })));
const playable = l => !P.previewOnly || l.preview;
const nourOk = () => Boolean(store.me && store.mentor.available);
const tabs = () => [['ov', t('overview')], ...(P.previewOnly ? [] : [['nt', t('notes')]]), ...(store.me ? [['qa', t('qa_tab')]] : []),
  ...(P.previewOnly ? [] : [['news', t('news_tab')]]), ...(nourOk() ? [['nour', t('nour_tab')]] : [])];

function outlineHTML(cur) {
  let h = '';
  P.sections.forEach((s, si) => {
    h += `<div class="osec">${t('module')} ${fmt(si + 1)} · ${esc(L(s.title))}</div>`;
    for (const l of s.lessons) {
      const ok = P.done.includes(l.id);
      const href = playable(l) ? `/learn/${P.course.slug}/lesson/${l.id}` : `/courses/${P.course.slug}`;
      h += `<a class="ol ${cur === l.id ? 'cur' : ''}" href="${href}"><span class="dot ${ok ? 'ok' : ''}">${ok ? ic('check') : playable(l) ? '' : ic('lock')}</span><span>${esc(L(l.title))}</span><small>${fmt(l.minutes)} ${t('min')}</small></a>`;
    }
  });
  if (P.quizCount) h += `<div class="osec">${t('checkpoint')}</div><a class="ol ${cur === 'q' ? 'cur' : ''}" href="/learn/${P.course.slug}/quiz"><span class="dot ${P.quizPassed ? 'ok' : ''}">${P.quizPassed ? ic('check') : ic('quiz')}</span><span>${t('checkpoint')}</span><small>${fmt(P.quizCount)} ${t('questions_n')}</small></a>`;
  return h;
}
const refreshChrome = cur => { $('#ring').innerHTML = ringHTML(P.progress.percent); $('#outline').innerHTML = outlineHTML(cur); };

async function load(slug) {
  if (P && P.course.slug === slug) return P;
  try {
    P = await get(`/api/learn/${slug}`);
  } catch (e) {
    if (e.status !== 401 && e.status !== 403) throw e;
    // Not enrolled: preview lessons are still watchable.
    const { course } = await get(`/api/courses/${slug}`);
    P = { course, sections: course.sections, done: [], quizPassed: false, quizCount: 0, previewOnly: true, progress: { percent: 0 }, lastLessonId: null };
  }
  return P;
}

export async function playerPage(m) {
  const [, slug, lessonPart] = m;
  onLeave(stopVideo);
  if (!$('#pmain') || P?.course.slug !== slug) loading();
  try { await load(slug); } catch (e) { return errorView(e); }
  const all = lessons();
  if (P.previewOnly && !all.some(playable)) { if (!requireUser()) return; return navigate(`/courses/${slug}`, { replace: true }); }

  let cur;
  if (lessonPart === 'quiz') cur = 'q';
  else if (lessonPart) cur = Number(lessonPart.split('/')[1]);
  else {
    // Resume at the last lesson if it's unfinished, otherwise at the next unfinished one after it.
    const lastIdx = Math.max(0, all.findIndex(l => l.id === P.lastLessonId));
    const pick = all.slice(lastIdx).find(l => !P.done.includes(l.id) && playable(l)) || all.find(l => !P.done.includes(l.id) && playable(l));
    cur = pick?.id ?? (P.quizCount && !P.quizPassed && !P.previewOnly ? 'q' : all.find(playable)?.id);
  }
  const lesson = all.find(l => l.id === cur);
  if (cur !== 'q' && (!lesson || !playable(lesson))) return navigate(`/courses/${slug}`, { replace: true });
  if (cur === 'q' && P.previewOnly) return navigate(`/courses/${slug}`, { replace: true });

  document.title = `${L(P.course.title)} · ${t('brand')}`;
  app().innerHTML = `<section class="wrap">
  <div class="ptop"><a class="back" href="/courses/${P.course.slug}">${ic('back', 'flip')}${t('back_course')}</a><h1>${esc(L(P.course.title))}</h1><div id="ring">${ringHTML(P.progress.percent)}</div></div>
  ${P.previewOnly ? `<div class="notice">${ic('info')}<span>${t('preview_only')} <a href="/courses/${P.course.slug}" style="font-weight:700;color:var(--brand)">${t('go_course')}</a></span></div>` : ''}
  <div class="player"><div id="pmain" style="min-width:0"></div>
  <aside class="outline"><div class="outline-h">${t('curr_title')}</div><div class="outline-b" id="outline">${outlineHTML(cur)}</div></aside></div></section>`;
  if (cur === 'q') renderQuiz(); else renderLesson(lesson, all);
  const curEl = $('.ol.cur');
  if (curEl && matchMedia('(min-width:981px)').matches) curEl.scrollIntoView({ block: 'nearest' });
}

/* ---------- lesson ---------- */
async function renderLesson(l, all) {
  const idx = all.findIndex(x => x.id === l.id);
  const next = all[idx + 1];
  const done = P.done.includes(l.id);
  $('#pmain').innerHTML = `<div class="stage" id="stage"><div class="vmsg"><div class="spin"></div></div></div>
  <div class="ctrl" id="ctrl"></div>
  <div class="ltitle"><div class="eyebrow">${t('module')} ${fmt(l.si + 1)} · ${esc(L(l.section.title))}</div><h2>${esc(L(l.title))}</h2></div>
  <div class="tabs" role="tablist">${tabs().map(([k, label]) => `<button class="tab" role="tab" aria-selected="${k === 'ov'}" aria-controls="tab-${k}" id="t-${k}" data-tab="${k}">${k === 'nour' ? ic('spark', 'sm') : ''}${label}</button>`).join('')}</div>
  <div class="tabp" id="tab-ov" role="tabpanel"><p class="muted" style="max-width:65ch">${t('lesson_about')}</p><p style="margin-top:12px" class="muted">${ic('clock', 'sm')} ${fmt(l.minutes)} ${t('min')} · ${t('by')} ${esc(P.course.instructor.name)}</p>
    ${next && playable(next) ? `<a class="btn btn-ghost" style="margin-top:16px" href="/learn/${P.course.slug}/lesson/${next.id}">${t('next')}${ic('chev', 'sm flip')}</a>`
    : !next && P.quizCount && !P.previewOnly ? `<a class="btn btn-brand" style="margin-top:16px" href="/learn/${P.course.slug}/quiz">${t('checkpoint')}${ic('chev', 'sm flip')}</a>` : ''}</div>
  <div class="tabp" id="tab-nt" role="tabpanel" hidden><textarea id="notes" placeholder="${t('notes_ph')}" aria-label="${t('notes')}"></textarea><div class="saved" id="nsaved"></div></div>
  <div class="tabp" id="tab-qa" role="tabpanel" hidden></div><div class="tabp" id="tab-news" role="tabpanel" hidden></div><div class="tabp" id="tab-nour" role="tabpanel" hidden></div>
  ${nourOk() ? `<button class="nour-fab" data-gonour aria-label="${t('ask_nour')}">${ic('spark')}<span>${t('ask_nour')}</span></button>` : ''}`;
  const show = (k, opts = {}) => {
    if (!$(`#tab-${k}`)) k = 'ov';
    $$('.tab').forEach(x => x.setAttribute('aria-selected', x.dataset.tab === k));
    $$('.tabp').forEach(p => { p.hidden = p.id !== `tab-${k}`; });
    if (k === 'qa') renderQA($('#tab-qa'), { course: P.course, lessonId: l.id, canAsk: !P.previewOnly, prefill: opts.prefill || '' });
    if (k === 'news') renderNews($('#tab-news'), P.course);
    if (k === 'nour') mountNour($('#tab-nour'), { course: P.course, lessonId: l.id, onAsk: text => show('qa', { prefill: text }) });
    $('[data-gonour]')?.toggleAttribute('hidden', k === 'nour');
    if (opts.scroll) $('.tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $$('.tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  $('[data-gonour]')?.addEventListener('click', () => show('nour', { scroll: true }));
  const want = current.query.get('tab');
  if (want) show(want === 'notes' ? 'nt' : want, { scroll: true });

  const doneBtn = () => P.previewOnly ? '' : `<button class="btn ${done ? 'donebtn' : 'btn-accent'}" id="vm">${done ? ic('check') + t('done_lbl') : t('mark_done')}</button>`;
  let video;
  try { video = (await get(`/api/lessons/${l.id}/play`)).video; } catch (e) { video = { type: 'unavailable', reason: tErr(e.message) }; }
  if (!$('#stage')) return; // navigated away
  const stage = $('#stage'), ctrl = $('#ctrl');
  if (video.type === 'none') {
    stage.innerHTML = `<canvas id="cv" aria-label="${esc(L(l.title))}"></canvas>`;
    ctrl.innerHTML = `<button class="ib" id="vp" aria-label="Play">${ic('play', 'fill')}</button><button class="skip" id="vb">−10</button><button class="skip" id="vf">+10</button>
      <input type="range" id="vr" min="0" max="1000" value="0" aria-label="Seek"><span class="vt" id="vt">0:00 / 0:00</span>
      <select id="vs" aria-label="Speed"><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="8">8×</option></select>${doneBtn()}`;
    setupSim(l);
  } else if (video.type === 'embed') {
    stage.innerHTML = `<iframe class="video-frame" src="${esc(video.src)}" title="${esc(L(l.title))}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    ctrl.innerHTML = `<span class="vt" style="flex:1">${ic(video.kind === 'bunny' ? 'lock' : 'video', 'sm')} ${fmt(l.minutes)} ${t('min')}</span>${doneBtn()}`;
  } else if (video.type === 'file') {
    stage.innerHTML = `<video controls preload="metadata" src="${esc(video.src)}"></video>`;
    ctrl.innerHTML = `<span class="vt" style="flex:1">${fmt(l.minutes)} ${t('min')}</span>${doneBtn()}`;
    $('video', stage).addEventListener('ended', () => complete(l));
  } else {
    stage.innerHTML = `<div class="vmsg">${esc(video.reason || t('err_generic'))}</div>`;
    ctrl.innerHTML = `<span style="flex:1"></span>${doneBtn()}`;
  }
  $('#vm')?.addEventListener('click', () => complete(l));

  if (!P.previewOnly) {
    try { $('#notes').value = (await get(`/api/lessons/${l.id}/note`)).body; } catch { /* notes optional */ }
    let nt;
    $('#notes')?.addEventListener('input', ev => {
      clearTimeout(nt);
      nt = setTimeout(async () => {
        try { await put(`/api/lessons/${l.id}/note`, { body: ev.target.value }); $('#nsaved').textContent = t('notes_saved'); } catch (e) { toastErr(e); }
      }, 500);
    });
  }
}

async function complete(l) {
  if (P.previewOnly) return;
  if (!P.done.includes(l.id)) {
    try {
      const r = await post(`/api/lessons/${l.id}/complete`);
      P.done.push(l.id); P.progress = r.progress; P.lastLessonId = l.id;
      toast(t('toast_done'));
    } catch (e) { return toastErr(e); }
  }
  const b = $('#vm'); if (b) { b.className = 'btn donebtn'; b.innerHTML = ic('check') + t('done_lbl'); }
  refreshChrome(l.id);
}

/* ---------- simulated lesson video (sample courses have no recordings) ---------- */
const mmss = s => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function setupSim(l) {
  const cv = $('#cv');
  V = { l, t: 0, dur: l.minutes * 60, playing: false, speed: 1, last: 0, seeking: false, shown: null };
  V.fit = () => { if (!V) return; const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0); draw(); };
  V.fit();
  const toggle = () => { if (V.t >= V.dur) V.t = 0; V.playing = !V.playing; V.last = 0; };
  cv.addEventListener('click', toggle); $('#vp').addEventListener('click', toggle);
  $('#vb').addEventListener('click', () => { V.t = Math.max(0, V.t - 10); });
  $('#vf').addEventListener('click', () => { V.t = Math.min(V.dur - 0.01, V.t + 10); });
  const vr = $('#vr');
  vr.addEventListener('input', () => { V.seeking = true; V.t = vr.value / 1000 * V.dur; });
  vr.addEventListener('change', () => { V.seeking = false; });
  $('#vs').addEventListener('change', e => { V.speed = Number(e.target.value); });
  window.addEventListener('resize', V.fit);
  document.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(tick);
}
function onKey(e) {
  if (e.key !== ' ' || !V || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) return;
  e.preventDefault(); if (V.t >= V.dur) V.t = 0; V.playing = !V.playing; V.last = 0;
}
function stopVideo() {
  if (raf) cancelAnimationFrame(raf);
  if (V) window.removeEventListener('resize', V.fit);
  document.removeEventListener('keydown', onKey);
  raf = null; V = null;
}
export function redrawPlayer() { if (V) draw(); }

function tick(ts) {
  if (!V) return;
  if (V.playing) {
    const dt = V.last ? (ts - V.last) / 1000 : 0;
    V.t = Math.min(V.dur, V.t + dt * V.speed);
    if (V.t >= V.dur) { V.playing = false; complete(V.l); }
  }
  V.last = ts; draw();
  const vr = $('#vr'); if (vr && !V.seeking) vr.value = Math.round(V.t / V.dur * 1000);
  const vt = $('#vt'); if (vt) vt.textContent = `${mmss(V.t)} / ${mmss(V.dur)}`;
  if (V.shown !== V.playing) { const b = $('#vp'); if (b) { b.innerHTML = ic(V.playing ? 'pause' : 'play', 'fill'); b.setAttribute('aria-label', V.playing ? 'Pause' : 'Play'); } V.shown = V.playing; }
  raf = requestAnimationFrame(tick);
}
function wrapText(ctx, text, x, y, maxW, lh) {
  let line = '', yy = y;
  for (const w of text.split(' ')) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = test;
  }
  ctx.fillText(line, x, yy);
  return yy;
}
function draw() {
  const cv = $('#cv'); if (!cv || !V) return;
  const ctx = cv.getContext('2d'), w = cv.clientWidth, h = cv.clientHeight, hue = P.course.hue, s = Math.max(0.55, w / 720);
  ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, `hsl(${hue} 45% 12%)`); g.addColorStop(1, `hsl(${hue + 20} 50% 22%)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const off = (V.t * 6) % 28; ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let x = -28 + off; x < w; x += 28) for (let y = 10; y < h; y += 28) ctx.fillRect(x, y, 1.6, 1.6);
  ctx.save(); ctx.globalAlpha = 0.09; ctx.fillStyle = '#fff'; ctx.font = `800 ${200 * s}px "Bricolage Grotesque", sans-serif`; ctx.textAlign = 'right'; ctx.fillText(P.course.glyph, w - 24 * s, h - 30 * s); ctx.restore();
  const pad = 40 * s, frac = V.t / V.dur;
  ctx.fillStyle = `hsl(${hue} 75% 75%)`; ctx.font = `600 ${12 * s}px "JetBrains Mono", monospace`;
  ctx.fillText(`SECTION ${V.l.si + 1} · ${V.l.section.title.en.toUpperCase()}`, pad, pad + 8 * s);
  ctx.fillStyle = '#fff'; ctx.font = `700 ${30 * s}px "Bricolage Grotesque", sans-serif`;
  const ty = wrapText(ctx, V.l.title.en, pad, pad + 50 * s, w - pad * 2, 36 * s);
  const cues = ['The core idea', 'A worked example', 'Mistakes to avoid', 'Your practice task'], th = [0, 0.22, 0.48, 0.72];
  cues.forEach((label, i) => {
    const a = i === 0 ? 1 : Math.max(0.18, Math.min(1, (frac - th[i]) * 14)), y = ty + (52 + i * 40) * s;
    const active = frac >= th[i] && (i === 3 || frac < th[i + 1]);
    ctx.globalAlpha = a; ctx.fillStyle = active ? '#F2B33D' : 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(pad + 7 * s, y - 6 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `${active ? 700 : 500} ${17 * s}px "Figtree", sans-serif`; ctx.fillText(label, pad + 26 * s, y); ctx.globalAlpha = 1;
  });
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(0, h - 4, w, 4); ctx.fillStyle = '#F2B33D'; ctx.fillRect(0, h - 4, w * frac, 4);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `700 ${13 * s}px "Bricolage Grotesque", sans-serif`; ctx.textAlign = 'right'; ctx.fillText('manhal', w - pad, pad + 8 * s); ctx.textAlign = 'left';
  if (!V.playing) {
    ctx.fillStyle = 'rgba(4,12,18,.35)'; ctx.fillRect(0, 0, w, h);
    const r = 34 * s, cx = w / 2, cy = h / 2;
    if (V.t >= V.dur) {
      ctx.fillStyle = '#F2B33D'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#231700'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 13 * s, cy); ctx.lineTo(cx - 3 * s, cy + 10 * s); ctx.lineTo(cx + 15 * s, cy - 10 * s); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 ${16 * s}px "Figtree", sans-serif`; ctx.fillText('Lesson complete', cx, cy + r + 28 * s); ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${hue} 50% 20%)`; ctx.beginPath(); ctx.moveTo(cx - 9 * s, cy - 14 * s); ctx.lineTo(cx + 15 * s, cy); ctx.lineTo(cx - 9 * s, cy + 14 * s); ctx.closePath(); ctx.fill();
    }
  }
}

/* ---------- checkpoint quiz ---------- */
async function renderQuiz() {
  let q;
  try { q = await get(`/api/courses/${P.course.id}/quiz`); } catch (e) { return toastErr(e); }
  if (!$('#pmain')) return;
  $('#pmain').innerHTML = `<form class="quiz" id="qf"><div class="eyebrow">${t('checkpoint')}</div><h2>${esc(L(P.course.title))}</h2>
  <p class="muted" style="margin-top:6px">${t('quiz_intro', { n: fmt(q.questions.length), p: fmt(q.passMark) })}</p>
  ${q.questions.map((x, qi) => `<fieldset class="qq" style="border:0;padding:0;margin-inline:0"><legend style="padding:0"><p>${fmt(qi + 1)}. ${esc(x.prompt)}</p></legend>${x.options.map((o, oi) => `<label class="opt" id="o${qi}-${oi}"><input type="radio" name="q${qi}" value="${oi}">${esc(o)}</label>`).join('')}</fieldset>`).join('')}
  <div id="qres" aria-live="polite"></div><div class="mrow" style="justify-content:flex-start"><button class="btn btn-accent" type="submit" id="qsub">${t('submit')}</button></div></form>
  ${nourOk() ? `<details class="box nour-hint" id="qnour"><summary>${ic('spark')}<b>${t('quiz_stuck')}</b><span class="muted">${t('quiz_stuck_sub')}</span></summary><div id="qnour-b"></div></details>` : ''}`;
  const qn = $('#qnour');
  if (qn) {
    const open = () => mountNour($('#qnour-b'), { course: P.course, lessonId: null, onAsk: () => {} });
    qn.addEventListener('toggle', () => { if (qn.open) open(); });
    if (current.query.get('nour')) { qn.open = true; qn.scrollIntoView({ block: 'start' }); }
  }
  $('#qf').addEventListener('submit', async ev => {
    ev.preventDefault();
    const answers = q.questions.map((_, qi) => { const r = $(`input[name="q${qi}"]:checked`); return r ? Number(r.value) : null; });
    if (answers.includes(null)) { $('#qres').innerHTML = `<div class="qres fail"><span>${t('quiz_need')}</span></div>`; return; }
    let r;
    try { r = await post(`/api/courses/${P.course.id}/quiz`, { answers }); } catch (e) { return toastErr(e); }
    q.questions.forEach((_, qi) => {
      $$(`[id^="o${qi}-"]`).forEach(x => x.classList.remove('right', 'wrong'));
      if (answers[qi] !== r.answers[qi]) $(`#o${qi}-${answers[qi]}`).classList.add('wrong');
      $(`#o${qi}-${r.answers[qi]}`).classList.add('right');
    });
    P.progress = r.progress;
    if (r.passed) P.quizPassed = true;
    const full = r.progress.percent === 100;
    $('#qres').innerHTML = `<div class="qres ${r.passed ? 'pass' : 'fail'}"><div><small class="muted">${t('score')}</small><br><b class="tnum">${fmt(r.score)}/${fmt(r.total)}</b></div><span style="flex:1">${r.passed ? t('passed') : t('failed')}${r.passed && !full ? ` ${t('finish_first')}` : ''}</span>${r.passed && full ? `<button class="btn btn-accent" type="button" id="getcert">${ic('award')}${t('get_cert')}</button>` : ''}</div>`;
    $('#getcert')?.addEventListener('click', () => openCertificate(P.course));
    const sub = $('#qsub'); sub.textContent = t('retry'); sub.type = 'button'; sub.onclick = () => renderQuiz();
    refreshChrome('q');
  });
}

export function resetPlayerCache() { P = null; resetNour(); }
