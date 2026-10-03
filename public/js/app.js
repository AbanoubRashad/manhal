import { store, t, savePrefs, applyLang, applyTheme, isDark } from './state.js';
import { patch } from './api.js';
import { $, closeModal, renderHeader, userMenu, notFoundView, toastErr } from './ui.js';
import { route, startRouter, render, current } from './router.js';
import { refreshMe, openCart, closeCart, removeFromCart, removeCoupon, checkout, toggleWish } from './cart.js';
import { openPal, closePal } from './palette.js';
import { homePage } from './pages/home.js';
import { explorePage } from './pages/explore.js';
import { coursePage } from './pages/course.js';
import { learningPage } from './pages/learning.js';
import { playerPage, redrawPlayer, resetPlayerCache } from './pages/player.js';
import { teachPage } from './pages/teach.js';
import { loginPage, registerPage, forgotPage, resetPage, verifyEmailPage, resendVerification, logout } from './pages/auth.js';
import { accountPage, ordersPage, orderPage } from './pages/account.js';
import { verifyPage } from './pages/certificate.js';
import { legalPage } from './pages/legal.js';
import { devMailPage } from './pages/devmail.js';
import { studioPage, editorPage, earningsPage } from './studio.js';
import { adminPage } from './admin.js';

route(/^\/$/, homePage, { nav: 'home' });
route(/^\/explore$/, explorePage, { nav: 'explore' });
route(/^\/courses\/([a-z0-9-]+)$/, coursePage, { nav: 'explore' });
route(/^\/learn\/([a-z0-9-]+)(?:\/(quiz|lesson\/\d+))?$/, playerPage, { nav: 'learning' });
route(/^\/learning$/, learningPage, { nav: 'learning' });
route(/^\/teach$/, teachPage, { nav: 'teach' });
route(/^\/login$/, loginPage);
route(/^\/register$/, registerPage);
route(/^\/forgot-password$/, forgotPage);
route(/^\/reset-password$/, resetPage);
route(/^\/verify-email$/, verifyEmailPage);
route(/^\/account$/, accountPage);
route(/^\/orders$/, ordersPage);
route(/^\/orders\/(\d+)$/, orderPage);
route(/^\/certificates(?:\/([A-Za-z0-9-]+))?$/, verifyPage);
route(/^\/(terms|privacy|refunds)$/, legalPage);
route(/^\/dev\/mail$/, devMailPage);
route(/^\/studio$/, studioPage, { nav: 'teach' });
route(/^\/studio\/earnings$/, earningsPage, { nav: 'teach' });
route(/^\/studio\/courses\/(\d+)$/, editorPage, { nav: 'teach' });
route(/^\/admin(?:\/(\w+))?$/, adminPage);

/* ---------- global events ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-cart],[data-closecart],[data-rm],[data-rmcoupon],[data-checkout],[data-close],[data-lang],[data-theme-t],[data-pal],[data-wish],[data-umenu],[data-logout],[data-resend],[data-resetdemo]');
  if (!el) {
    if (!e.target.closest('.umenu')) document.querySelector('.menu')?.remove();
    return;
  }
  const d = el.dataset;
  if ('cart' in d) { e.preventDefault(); openCart(); }
  else if ('closecart' in d) closeCart();
  else if (d.rm) removeFromCart(Number(d.rm));
  else if ('rmcoupon' in d) removeCoupon();
  else if ('checkout' in d) checkout();
  else if ('close' in d) closeModal();
  else if ('pal' in d) openPal();
  else if ('umenu' in d) userMenu(el);
  else if ('logout' in d) logout();
  else if ('resend' in d) resendVerification();
  else if ('resetdemo' in d) window.__manhalDemo?.reset();
  else if ('lang' in d) {
    store.lang = store.lang === 'en' ? 'ar' : 'en';
    savePrefs(); applyLang(); resetPlayerCache();
    if (store.me) patch('/api/account', { lang: store.lang }).then(r => { store.me = r.user; }).catch(() => {});
    renderHeader(); render({ keepScroll: true });
  } else if ('themeT' in d) {
    store.theme = isDark() ? 'light' : 'dark';
    savePrefs(); applyTheme(); renderHeader(); redrawPlayer();
  } else if (d.wish) {
    e.preventDefault();
    const on = el.getAttribute('aria-pressed') === 'true';
    const next = await toggleWish(Number(d.wish), on);
    if (next !== null) { el.classList.toggle('on', next); el.setAttribute('aria-pressed', next); }
  }
});
$('#scrim').addEventListener('click', closeCart);
$('#pal').addEventListener('click', e => { if (e.target.id === 'pal' || e.target.closest('.pal-i')) closePal(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#pal').hidden ? openPal() : closePal(); return; }
  if (e.key === 'Escape') {
    if (!$('#pal').hidden) closePal();
    else if (!$('#modal').hidden) closeModal();
    else { closeCart(); document.querySelector('.menu')?.remove(); }
  }
});

/* ---------- boot ---------- */
applyLang();
applyTheme();
(async () => {
  try { await refreshMe(); } catch (err) { if (err.status !== 0) toastErr(err); }
  await startRouter({
    render: () => { closeModal(); closeCart(); closePal(); renderHeader(); document.title = `${t('brand')}`; },
    notFound: notFoundView,
  });
  if (current.path === '/' && location.hash === '#cart') openCart();
})();
