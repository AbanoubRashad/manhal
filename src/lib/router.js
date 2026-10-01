/**
 * Minimal router. Routes are registered with a role requirement:
 *   auth: undefined (public) | 'user' | 'instructor' | 'admin'
 * and optional csrf: false for signed provider callbacks.
 */
export function createRouter() {
  const routes = [];
  const add = method => (path, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, path, re, keys, handler, ...opts });
  };
  return {
    routes,
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    /** Find a route. Returns { route, params } or { allowed: [methods] } when only the method is wrong. */
    match(method, path) {
      const allowed = [];
      for (const r of routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        if (r.method !== method) { allowed.push(r.method); continue; }
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
      return { allowed };
    },
  };
}
