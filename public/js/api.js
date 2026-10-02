import { store } from './state.js';

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || {}; }
}

/**
 * Call the Manhal API. In the static demo build, requests go to the same server code
 * running in the browser (window.__manhalDemo) instead of over the network.
 */
export async function api(method, path, body) {
  const headers = { 'X-Requested-With': 'manhal', 'X-Lang': store.lang };
  if (store.csrf) headers['X-CSRF-Token'] = store.csrf;
  let status, data;
  if (window.__manhalDemo) {
    ({ status, body: data } = await window.__manhalDemo.request(method, path, body, headers));
  } else {
    let res;
    try {
      res = await fetch(path, {
        method, credentials: 'same-origin',
        headers: body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, '');
    }
    status = res.status;
    try { data = await res.json(); } catch { data = null; }
  }
  if (status >= 400) {
    if (status === 401) { store.me = null; store.csrf = null; }
    throw new ApiError(status, data?.error || '', data);
  }
  return data;
}

export const get = path => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body) => api('PUT', path, body);
export const patch = (path, body) => api('PATCH', path, body);
export const del = path => api('DELETE', path);
