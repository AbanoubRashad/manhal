import { store, t, tErr, esc, L, date } from '../state.js';
import { get, post } from '../api.js';
import { ic, LOGO_CERT } from '../icons.js';
import { app, $, openModal, toast, toastErr, footer, loading, errorView, bindForm } from '../ui.js';
import { navigate } from '../router.js';

const certHTML = c => `<div class="cert" dir="${store.lang === 'ar' ? 'rtl' : 'ltr'}"><div class="seal">MANHAL</div><div class="cl">${LOGO_CERT}${t('brand')}</div>
  <div class="ct">${t('cert_of')}</div><p style="margin-top:18px;color:#5B6870">${t('cert_body')}</p><div class="cn" id="certname">${esc(c.name)}</div>
  <p style="color:#5B6870">${t('cert_for')}</p><div class="cc">${esc(L(c.course.title))}</div>
  <div class="cf"><span>${t('issued')}: ${date(c.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span>${esc(c.instructor.name)}, ${esc(c.instructor.headline)}</span><span>${t('cert_id')}: ${esc(c.code)}</span></div></div>`;

/** Issue (first time) or show the certificate for a completed course. */
export async function openCertificate(course) {
  let cert;
  try { cert = (await post(`/api/courses/${course.id}/certificate`, {})).certificate; } catch (e) { return toastErr(e); }
  const link = `${location.origin}/certificates/${cert.code}`;
  openModal(`${certHTML(cert)}
  <div class="field"><label for="cname">${t('cert_name')}</label><input id="cname" value="${esc(cert.name)}" maxlength="60" autocomplete="name"></div>
  <div class="field"><label for="clink">${t('cert_link')}</label><input id="clink" value="${esc(link)}" readonly></div>
  <div class="mrow"><button class="btn btn-ghost" id="ccopy">${t('cert_copy')}</button><button class="btn btn-ghost" id="cprint">${t('cert_print')}</button><button class="btn btn-brand" data-close>${t('close')}</button></div>`, true);
  let timer;
  $('#cname').addEventListener('input', e => {
    const v = e.target.value.trim();
    $('#certname').textContent = v || store.me.name;
    clearTimeout(timer);
    timer = setTimeout(() => { if (v.length >= 2) post(`/api/courses/${course.id}/certificate`, { name: v }).catch(toastErr); }, 600);
  });
  $('#ccopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(link); toast(t('copied')); } catch { $('#clink').select(); } });
  $('#cprint').addEventListener('click', () => window.print());
}

/** Public verification page: /certificates and /certificates/:code */
export async function verifyPage(m) {
  const code = m[1];
  const form = `<form class="box" id="vf"><h2>${t('cert_lookup')}</h2><div class="field"><label for="vcode">${t('cert_id')}</label><input id="vcode" name="code" placeholder="MNL-XXXX-XXXXXX" required value="${esc(code || '')}"></div><div class="form-msg"></div><button class="btn btn-brand" type="submit" style="margin-top:14px">${t('cert_lookup_btn')}</button></form>`;
  if (!code) {
    app().innerHTML = `<section class="verify-card"><h1 style="font-size:2rem">${t('verify_page')}</h1>${form}</section>${footer()}`;
  } else {
    loading();
    let c;
    try { c = (await get(`/api/certificates/${encodeURIComponent(code)}`)).certificate; } catch (e) {
      if (e.status !== 404) return errorView(e);
      app().innerHTML = `<section class="verify-card"><h1 style="font-size:2rem">${t('verify_page')}</h1>${form}</section>${footer()}`;
      $('#vf .form-msg').className = 'form-msg form-err';
      $('#vf .form-msg').textContent = tErr(e.message);
      bindVerify();
      return;
    }
    app().innerHTML = `<section class="verify-card"><h1 style="font-size:2rem">${t('verify_page')}</h1>
      <div class="notice" style="background:color-mix(in srgb,var(--good) 12%,transparent)">${ic('shield')}<span><b>${t('cert_valid')}</b></span></div>
      ${certHTML(c)}
      <div class="box"><div class="kv"><span class="muted">${t('cert_issued_to')}</span><b>${esc(c.name)}</b></div><div class="kv"><span class="muted">${t('cert_course')}</span><a href="/courses/${c.course.slug}">${esc(L(c.course.title))}</a></div><div class="kv"><span class="muted">${t('cert_instructor')}</span><span>${esc(c.instructor.name)}</span></div><div class="kv"><span class="muted">${t('issued')}</span><span>${date(c.issuedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div>
      ${form}</section>${footer()}`;
  }
  bindVerify();
}
function bindVerify() {
  bindForm($('#vf'), async v => navigate(`/certificates/${encodeURIComponent(v.code.trim().toUpperCase())}`));
}
