import { store, t, tErr, esc, money, L, fmt, savePrefs } from './state.js';
import { get, post, del } from './api.js';
import { ic } from './icons.js';
import { $, toast, toastErr, mini, openModal, closeModal, renderHeader } from './ui.js';
import { navigate } from './router.js';

/** Reload the signed-in user, CSRF token and cart count. */
export async function refreshMe() {
  const me = await get('/api/me');
  store.me = me.user; store.csrf = me.csrf; store.cartCount = me.cartCount; store.config = me.config || {};
  return me;
}

/** Catalog cards, cached for search, the guest cart and the learning path. */
export async function catalog(force = false) {
  if (!store.courses || force) store.courses = (await get('/api/courses')).courses;
  return store.courses;
}
export const courseById = id => store.courses?.find(c => c.id === id);

/** After sign-in, move the guest cart into the account's cart. */
export async function mergeGuestCart() {
  const ids = [...store.guestCart];
  store.guestCart = []; savePrefs();
  for (const id of ids) { try { await post('/api/cart', { courseId: id }); } catch { /* enrolled or free: skip */ } }
  if (ids.length) await refreshMe();
}

export async function addToCart(course, { open = false } = {}) {
  if (course.enrolled) return navigate(`/learn/${course.slug}`);
  if (course.price === 0) return enrollFree(course);
  if (!store.me) {
    if (!store.guestCart.includes(course.id)) store.guestCart.push(course.id);
    savePrefs();
  } else {
    try { const r = await post('/api/cart', { courseId: course.id }); store.cartCount = r.cart.items.length; } catch (e) { return toastErr(e); }
  }
  course.inCart = true;
  renderHeader();
  if (open) openCart(); else toast(t('toast_added'));
}

export async function enrollFree(course) {
  if (!store.me) return navigate(`/login?next=${encodeURIComponent('/courses/' + course.slug)}`);
  try {
    await post(`/api/courses/${course.id}/enroll`);
    toast(t('toast_enrolled'));
    store.courses = null;
    navigate(`/learn/${course.slug}`);
  } catch (e) { toastErr(e); }
}

export async function toggleWish(id, on) {
  if (!store.me) { navigate(`/login?next=${encodeURIComponent(location.pathname)}`); return null; }
  try {
    if (on) await del(`/api/wishlist/${id}`); else await post(`/api/wishlist/${id}`);
    toast(on ? t('toast_unsaved') : t('toast_saved'));
    const c = courseById(id); if (c) c.wished = !on;
    return !on;
  } catch (e) { toastErr(e); return null; }
}

/* ---------- drawer ---------- */
const drawer = () => $('#drawer');
export function closeCart() { drawer().classList.remove('open'); $('#scrim').classList.remove('open'); }
export async function openCart() {
  drawer().innerHTML = `<div class="dhead"><h2>${t('cart_title')}</h2><button class="ib" data-closecart aria-label="${t('close')}">${ic('x')}</button></div><div class="dlist"><div class="loading"><div class="spin"></div></div></div>`;
  drawer().classList.add('open'); $('#scrim').classList.add('open');
  await renderCart();
  setTimeout(() => { const b = $('#drawer .ib'); b && b.focus(); }, 50);
}

async function cartData() {
  if (store.me) return (await get('/api/cart')).cart;
  await catalog();
  const items = store.guestCart.map(courseById).filter(Boolean).map(c => ({ ...c, paid: c.price }));
  const subtotal = items.reduce((a, c) => a + c.price, 0);
  return { items, subtotal, discount: 0, total: subtotal, coupon: null, guest: true };
}

export async function renderCart() {
  let c;
  try { c = await cartData(); } catch (e) { toastErr(e); return; }
  if (store.me) { store.cartCount = c.items.length; renderHeader(); }
  const head = `<div class="dhead"><h2>${t('cart_title')}</h2><button class="ib" data-closecart aria-label="${t('close')}">${ic('x')}</button></div>`;
  if (!c.items.length) {
    drawer().innerHTML = `${head}<div class="dlist"><div class="empty" style="margin-top:20px">${ic('cart')}<p>${t('cart_empty')}</p><a class="btn btn-brand" href="/explore" data-closecart>${t('cart_browse')}</a></div></div>`;
    return;
  }
  drawer().innerHTML = `${head}<div class="dlist">${c.items.map(it => `<div class="citem">${mini(it)}<div><b>${esc(L(it.title))}</b><small>${esc(it.instructor.name)}</small><div><button class="linkbtn" data-rm="${it.id}">${t('remove')}</button></div></div><b class="tnum">${money(it.price)}</b></div>`).join('')}</div>
  <div class="dfoot">
    ${c.guest ? `<p class="muted" style="font-size:.85rem">${t('signin_coupon')}</p>` : c.coupon
    ? `<div class="coupon-msg ok">${t('coupon_applied', { code: esc(c.coupon.code), n: fmt(c.coupon.percent) })} <button class="linkbtn" data-rmcoupon>${t('coupon_remove')}</button></div>`
    : `<form class="coupon" id="coupon"><input id="cc" name="code" placeholder="${t('coupon_ph')}" aria-label="${t('coupon_ph')}" autocomplete="off"><button class="btn btn-ghost" type="submit">${t('apply')}</button></form><div class="coupon-msg" id="cmsg"></div>`}
    <div class="trow"><span>${t('subtotal')}</span><span>${money(c.subtotal)}</span></div>
    ${c.discount ? `<div class="trow" style="color:var(--good)"><span>${t('discount')}</span><span>-${money(c.discount)}</span></div>` : ''}
    <div class="trow tot"><span>${t('total')}</span><span>${money(c.total)}</span></div>
    ${c.guest ? `<a class="btn btn-accent btn-block" href="/login?next=%2Fcart" data-closecart>${t('signin_checkout')}</a>` : `<button class="btn btn-accent btn-block" data-checkout>${t('checkout')}</button>`}
  </div>`;
  const f = $('#coupon');
  if (f) f.addEventListener('submit', async e => {
    e.preventDefault();
    try { await post('/api/cart/coupon', { code: $('#cc').value }); renderCart(); }
    catch (err) { const m = $('#cmsg'); m.textContent = tErr(err.message); m.className = 'coupon-msg bad'; }
  });
}

export async function removeFromCart(id) {
  if (store.me) { try { await del(`/api/cart/${id}`); } catch (e) { toastErr(e); } }
  else { store.guestCart = store.guestCart.filter(x => x !== id); savePrefs(); }
  const c = courseById(id); if (c) c.inCart = false;
  renderHeader(); renderCart();
}
export async function removeCoupon() { try { await del('/api/cart/coupon'); } catch (e) { toastErr(e); } renderCart(); }

export async function checkout() {
  let c;
  try { c = (await get('/api/cart')).cart; } catch (e) { return toastErr(e); }
  closeCart();
  const paymob = store.config.payments === 'paymob' && c.total > 0;
  openModal(`<h2>${t('co_title')}</h2><div class="notice">${ic(paymob ? 'lock' : 'info')}<span>${paymob ? t('co_note_paymob') : t('co_note_demo')}</span></div>
  ${c.items.map(it => `<div class="trow" style="padding:6px 0"><span>${esc(L(it.title))}</span><span>${money(it.paid)}</span></div>`).join('')}
  ${c.discount ? `<div class="trow" style="padding:6px 0;color:var(--good)"><span>${t('discount')} (${esc(c.coupon.code)})</span><span>-${money(c.discount)}</span></div>` : ''}
  <div class="trow tot" style="margin-top:8px"><span>${t('total')}</span><span>${money(c.total)}</span></div>
  <div class="form-msg"></div>
  <div class="mrow"><button class="btn btn-ghost" data-close>${t('cancel')}</button><button class="btn btn-accent" id="co-go">${paymob ? t('co_pay') : t('co_confirm')}</button></div>`);
  $('#co-go').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const r = await post('/api/checkout');
      if (r.status === 'redirect') { btn.textContent = t('redirecting'); location.href = r.url; return; }
      closeModal();
      store.courses = null;
      await refreshMe(); renderHeader();
      toast(t('toast_enrolled'));
      navigate(c.items.length === 1 ? `/learn/${c.items[0].slug}` : `/orders/${r.orderId}?payment=paid`);
    } catch (err) {
      btn.disabled = false;
      const m = $('.modal-card .form-msg');
      if (m) { m.className = 'form-msg form-err'; m.textContent = tErr(err.message); }
      if (err.data?.code === 'verify_email') btn.remove();
    }
  });
}
