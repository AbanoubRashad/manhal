import { T, ERRORS_AR } from './i18n.js';

const LS = 'manhal-prefs';
let prefs = {};
try { prefs = JSON.parse(localStorage.getItem(LS)) || {}; } catch { /* private mode */ }

/** App-wide state. `me` comes from /api/me; guestCart holds course ids before sign-in. */
export const store = {
  me: null, csrf: null, cartCount: 0, config: {},
  lang: prefs.lang || (navigator.language?.startsWith('ar') ? 'ar' : 'en'),
  theme: prefs.theme || null,
  guestCart: Array.isArray(prefs.guestCart) ? prefs.guestCart : [],
  courses: null, // cached catalog cards for search and the guest cart
};

export function savePrefs() {
  try { localStorage.setItem(LS, JSON.stringify({ lang: store.lang, theme: store.theme, guestCart: store.guestCart })); } catch { /* ignore */ }
}

/** Translate a key, filling {placeholders}. */
export function t(key, vars) {
  let s = T[store.lang][key] ?? T.en[key] ?? key;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
}
/** Server error messages, translated when we know them. */
export const tErr = msg => (store.lang === 'ar' && ERRORS_AR[msg]) || msg || t('err_generic');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const locale = () => (store.lang === 'ar' ? 'ar-EG' : 'en-US');
export const fmt = n => Number(n).toLocaleString(locale());
/** An amount of money (0 shows as 0 EGP, unlike prices). */
export const egp = n => `${fmt(n)} ${t('currency')}`;
export const money = p => (p === 0 ? t('free') : `${fmt(p)} ${t('currency')}`);
export const dur = min => { const h = Math.floor(min / 60), m = min % 60; return h ? `${fmt(h)}${t('h')} ${fmt(m)}${t('m')}` : `${fmt(m)} ${t('min')}`; };
/** Pick the right language from a { en, ar } pair. */
export const L = pair => (pair ? (store.lang === 'ar' ? pair.ar || pair.en : pair.en) : '');
export const lvl = k => t('lv_' + k);
export const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
export const date = (s, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  s ? new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z')).toLocaleDateString(store.lang === 'ar' ? 'ar-EG' : 'en-GB', opts) : '';

export function applyLang() {
  document.documentElement.lang = store.lang;
  document.documentElement.dir = store.lang === 'ar' ? 'rtl' : 'ltr';
}
export function applyTheme() {
  if (store.theme) document.documentElement.setAttribute('data-theme', store.theme);
  else document.documentElement.removeAttribute('data-theme');
}
export const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark' ||
  (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
