// History-API router. Pages are async functions that render into #app.
const routes = [];
let leaving = [];
let onRender = () => {};
let notFound = () => {};
export const current = { path: '/', nav: null, query: new URLSearchParams() };

/** Register a page. opts.nav marks which header item is active. */
export function route(re, page, opts = {}) { routes.push({ re, page, ...opts }); }

/** Run fn when the user leaves the current page (stop timers, video, etc.). */
export function onLeave(fn) { leaving.push(fn); }

export function navigate(to, { replace = false, keepScroll = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) { location.href = to; return; }
  const same = url.pathname + url.search === location.pathname + location.search;
  if (replace || same) history.replaceState(null, '', url.pathname + url.search + url.hash);
  else history.pushState(null, '', url.pathname + url.search + url.hash);
  render({ keepScroll });
}

export async function render({ keepScroll = false } = {}) {
  leaving.forEach(fn => { try { fn(); } catch { /* ignore */ } });
  leaving = [];
  const path = location.pathname.replace(/\/+$/, '') || '/';
  current.path = path;
  current.query = new URLSearchParams(location.search);
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    current.nav = r.nav || null;
    onRender(r);
    if (!keepScroll) window.scrollTo(0, 0);
    await r.page(m, current.query);
    return;
  }
  current.nav = null;
  onRender({});
  notFound();
}

export function startRouter({ render: renderHook, notFound: nf }) {
  onRender = renderHook;
  notFound = nf;
  window.addEventListener('popstate', () => render({ keepScroll: true }));
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download') || a.dataset.external !== undefined) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) return;
    e.preventDefault();
    navigate(href);
  });
  return render();
}
