import { store, t, esc, fmt, money, egp, L, date } from './state.js';
import { get, post, patch, put, del } from './api.js';
import { ic } from './icons.js';
import { app, $, $$, badge, footer, loading, errorView, requireUser, toast, toastErr, bindForm, okMsg, field } from './ui.js';
import { navigate, current } from './router.js';

const TABS = ['overview', 'users', 'courses', 'orders', 'coupons', 'payouts', 'applications', 'settings'];
const tabLabel = k => t(k === 'overview' ? 'overview_tab' : k);

function shell(tab, body) {
  app().innerHTML = `<section class="wrap"><div class="dash-head"><div><div class="eyebrow">${t('admin')}</div><h1>${t('admin_title')}</h1></div></div>
  <nav class="subnav" aria-label="${t('admin')}">${TABS.map(k => `<a href="/admin${k === 'overview' ? '' : '/' + k}" ${k === tab ? 'aria-current="page"' : ''}>${tabLabel(k)}</a>`).join('')}</nav>
  <div class="sec" id="adm">${body}</div></section>${footer()}`;
}
const table = (heads, rows) => `<div class="table-wrap"><table class="t"><thead><tr>${heads.map(h => `<th${h.startsWith('#') ? ' class="num"' : ''}>${h.replace(/^#/, '')}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

export async function adminPage(m) {
  if (!requireUser()) return;
  if (store.me.role !== 'admin') return errorView({ status: 403, message: 'Only admins can do that.' });
  const tab = m[1] || 'overview';
  if (!TABS.includes(tab)) return errorView({ status: 404 });
  loading();
  try { await VIEWS[tab](); } catch (e) { errorView(e); }
}
const reload = () => VIEWS[current.path.split('/')[2] || 'overview']().catch(toastErr);

const VIEWS = {
  async overview() {
    const o = await get('/api/admin/overview');
    const max = Math.max(1, ...o.months.map(x => x.revenue));
    const tile = (icon, v, label, hot) => `<div class="tile"><span class="ti ${hot ? 'hot' : ''}">${ic(icon)}</span><div><b>${v}</b><span>${label}</span></div></div>`;
    shell('overview', `<div class="tiles">
      ${tile('coin', egp(o.revenue), t('revenue'), true)}${tile('users', fmt(o.users), t('users'))}${tile('book', fmt(o.enrollments), t('enrollments'))}${tile('layers', fmt(o.published), t('st_published'))}
      ${tile('pen', fmt(o.drafts), t('drafts'))}${tile('award', fmt(o.instructors), t('instructors_n'))}${tile('clock', fmt(o.payoutsWaiting), t('waiting_payouts'), o.payoutsWaiting > 0)}${tile('mail', fmt(o.applications), t('new_apps'), o.applications > 0)}
    </div>
    <div class="panel"><h3>${t('revenue_by_month')} <small>${t('refunded_total')}: ${egp(o.refunded)}</small></h3>
      ${o.months.length ? `<div class="bars">${o.months.map(x => `<div><b class="tnum">${fmt(x.revenue)}</b><i style="height:${Math.max(2, x.revenue / max * 100)}%"></i><small>${x.month}</small></div>`).join('')}</div>` : ''}</div>`);
  },

  async users() {
    const q = current.query.get('q') || '';
    const { users } = await get(`/api/admin/users?q=${encodeURIComponent(q)}`);
    shell('users', `<form class="toolbar" id="uq"><input name="q" type="search" value="${esc(q)}" placeholder="${t('search_users')}" aria-label="${t('search_users')}"><button class="btn btn-ghost" type="submit">${ic('search')}</button></form>
    ${table([t('name'), t('email'), t('role'), t('enrollments'), t('courses'), t('joined')], users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)} ${u.emailVerified ? ic('check', 'sm') : ''}</td>
      <td><select data-role="${u.id}" aria-label="${t('role')}" ${u.id === store.me.id ? 'disabled' : ''}>${['learner', 'instructor', 'admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('role_' + r)}</option>`).join('')}</select></td>
      <td class="num">${fmt(u.enrollments)}</td><td class="num">${fmt(u.courses)}</td><td>${date(u.createdAt)}</td></tr>`))}`);
    $('#uq').addEventListener('submit', e => { e.preventDefault(); navigate(`/admin/users?q=${encodeURIComponent(e.target.q.value.trim())}`, { replace: true }); });
    $$('[data-role]').forEach(s => s.addEventListener('change', async () => {
      try { await patch(`/api/admin/users/${s.dataset.role}`, { role: s.value }); toast(t('saved')); } catch (e) { toastErr(e); reload(); }
    }));
  },

  async courses() {
    const { courses } = await get('/api/admin/courses');
    shell('courses', table([t('course'), t('instructor'), t('status'), '#' + t('price'), '#' + t('learners_n'), t('updated'), ''], courses.map(c => `<tr>
      <td><a href="/courses/${c.slug}">${esc(L(c.title))}</a></td><td>${esc(c.instructor.name)}</td><td>${badge(c.status)}</td><td class="num">${money(c.price)}</td><td class="num">${fmt(c.learners)}</td><td>${date(c.updatedAt)}</td>
      <td><div class="actions"><a class="mini-btn" href="/studio/courses/${c.id}">${t('edit')}</a>${c.status === 'archived'
        ? `<button class="mini-btn" data-cs="${c.id}" data-v="draft">${t('restore')}</button>`
        : `<button class="mini-btn danger" data-cs="${c.id}" data-v="archived">${t('archive')}</button>`}</div></td></tr>`)));
    $$('[data-cs]').forEach(b => b.addEventListener('click', async () => {
      try { await patch(`/api/admin/courses/${b.dataset.cs}`, { status: b.dataset.v }); reload(); } catch (e) { toastErr(e); }
    }));
  },

  async orders() {
    const status = current.query.get('status') || '';
    const { orders } = await get(`/api/admin/orders${status ? `?status=${status}` : ''}`);
    shell('orders', `<div class="toolbar"><select id="ost" aria-label="${t('status')}"><option value="">${t('any_status')}</option>${['paid', 'pending', 'failed', 'refunded'].map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${t('st_' + s)}</option>`).join('')}</select></div>
    ${table(['#', t('learner'), t('date'), t('status'), t('provider'), '#' + t('discount'), '#' + t('total'), ''], orders.map(o => `<tr>
      <td><b class="tnum">${fmt(o.id)}</b></td><td>${esc(o.user.name)}<br><small class="muted">${esc(o.user.email)}</small></td><td>${date(o.createdAt)}</td>
      <td>${badge(o.status)}${o.failureReason ? `<br><small class="muted">${esc(o.failureReason)}</small>` : ''}</td><td>${esc(o.provider)}</td>
      <td class="num">${o.discount ? egp(o.discount) : '–'}</td><td class="num">${egp(o.total)}</td>
      <td>${o.status === 'paid' && o.total > 0 ? `<button class="mini-btn danger" data-refund="${o.id}">${t('refund_btn')}</button>` : ''}</td></tr>`))}`);
    $('#ost').addEventListener('change', e => navigate(`/admin/orders${e.target.value ? `?status=${e.target.value}` : ''}`, { replace: true }));
    $$('[data-refund]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(t('refund_confirm', { n: b.dataset.refund }))) return;
      b.disabled = true;
      try { await post(`/api/admin/orders/${b.dataset.refund}/refund`); toast(t('st_refunded')); reload(); } catch (e) { toastErr(e); b.disabled = false; }
    }));
  },

  async coupons() {
    const { coupons } = await get('/api/admin/coupons');
    shell('coupons', `<div class="acct-grid"><div>${table([t('code'), '#' + t('percent'), '#' + t('uses'), t('expires'), t('status'), ''], coupons.map(c => `<tr>
      <td><b>${esc(c.code)}</b></td><td class="num">${fmt(c.percent)}%</td><td class="num">${fmt(c.uses)} / ${c.maxUses ? fmt(c.maxUses) : t('unlimited')}</td><td>${c.expiresAt ? date(c.expiresAt) : t('never')}</td>
      <td>${c.active ? `<span class="st-badge st-paid">${t('active')}</span>` : `<span class="st-badge">${t('inactive')}</span>`}</td>
      <td>${c.active ? `<button class="mini-btn danger" data-delc="${esc(c.code)}">${t('delete')}</button>` : ''}</td></tr>`))}</div>
    <form class="box" id="cpf" novalidate><h2>${t('add_coupon')}</h2>
      ${field('code', t('code'), 'required maxlength="30" style="text-transform:uppercase" dir="ltr"')}
      <div class="row2">${field('percent', t('percent'), 'type="number" min="1" max="100" required value="10"')}${field('maxUses', t('max_uses'), `type="number" min="1" placeholder="${t('unlimited')}"`)}</div>
      ${field('expiresAt', t('expires'), 'type="date"')}
      <div class="form-msg"></div><button class="btn btn-accent" type="submit" style="margin-top:14px">${t('add_coupon')}</button></form></div>`);
    bindForm($('#cpf'), async v => {
      await post('/api/admin/coupons', { code: v.code, percent: Number(v.percent), maxUses: v.maxUses ? Number(v.maxUses) : undefined, expiresAt: v.expiresAt || undefined });
      toast(t('saved')); reload();
    });
    $$('[data-delc]').forEach(b => b.addEventListener('click', async () => {
      try { await del(`/api/admin/coupons/${encodeURIComponent(b.dataset.delc)}`); reload(); } catch (e) { toastErr(e); }
    }));
  },

  async payouts() {
    const { payouts } = await get('/api/admin/payouts');
    shell('payouts', payouts.length ? table([t('instructor'), t('date'), t('method'), t('details'), '#' + t('amount'), '#' + t('balance'), t('status'), ''], payouts.map(p => `<tr>
      <td><b>${esc(p.instructor.name)}</b><br><small class="muted">${esc(p.instructor.email)}</small></td><td>${date(p.requestedAt)}</td><td>${t('m_' + p.method)}</td><td dir="auto">${esc(p.details)}</td>
      <td class="num"><b>${egp(p.amount)}</b></td><td class="num">${egp(p.balance.available)}</td><td>${badge(p.status)}${p.note ? `<br><small class="muted">${esc(p.note)}</small>` : ''}</td>
      <td>${p.status === 'requested' ? `<div class="actions"><button class="mini-btn" data-pay="${p.id}" data-a="paid">${ic('check')}${t('mark_paid')}</button><button class="mini-btn danger" data-pay="${p.id}" data-a="rejected">${t('reject')}</button></div>` : ''}</td></tr>`))
      : `<div class="empty"><p>${t('no_payouts')}</p></div>`);
    $$('[data-pay]').forEach(b => b.addEventListener('click', async () => {
      let note = '';
      if (b.dataset.a === 'paid') { if (!confirm(t('payout_paid_q'))) return; }
      else { note = prompt(t('reject_q')); if (note === null) return; }
      try { await post(`/api/admin/payouts/${b.dataset.pay}`, { action: b.dataset.a, note }); reload(); } catch (e) { toastErr(e); }
    }));
  },

  async applications() {
    const { applications } = await get('/api/admin/applications');
    shell('applications', applications.length ? table([t('name'), t('email'), t('f_topic'), t('date'), t('status')], applications.map(a => `<tr>
      <td><b>${esc(a.name)}</b></td><td><a href="mailto:${esc(a.email)}" data-external>${esc(a.email)}</a></td><td>${esc(a.topic)}</td><td>${date(a.created_at)}</td>
      <td><select data-app="${a.id}" aria-label="${t('status')}">${['new', 'contacted', 'approved', 'declined'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${t('st_' + s)}</option>`).join('')}</select></td></tr>`))
      : `<div class="empty"><p>–</p></div>`);
    $$('[data-app]').forEach(s => s.addEventListener('change', async () => {
      try { await patch(`/api/admin/applications/${s.dataset.app}`, { status: s.value }); toast(t('saved')); } catch (e) { toastErr(e); }
    }));
  },

  async settings() {
    const { revenueShare } = await get('/api/admin/settings');
    shell('settings', `<form class="box" id="sf" style="max-width:520px" novalidate><h2>${t('settings')}</h2>
      ${field('share', t('share_label'), `type="number" min="10" max="95" step="1" required value="${Math.round(revenueShare * 100)}"`, t('share_hint'))}
      <div class="form-msg"></div><button class="btn btn-accent" type="submit" style="margin-top:14px">${t('save')}</button></form>`);
    bindForm($('#sf'), async (v, form) => {
      await put('/api/admin/settings', { revenueShare: Number(v.share) / 100 });
      okMsg(form, t('saved'));
    });
  },
};
