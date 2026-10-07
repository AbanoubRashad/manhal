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

/**
 * POST and read a stream of Server-Sent Events, calling onEvent({ type, ... }) for each.
 * Refusals (limits, access) arrive as normal JSON errors and throw an ApiError.
 */
export async function stream(path, body, onEvent) {
  const headers = { 'X-Requested-With': 'manhal', 'X-Lang': store.lang, 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (store.csrf) headers['X-CSRF-Token'] = store.csrf;
  if (window.__manhalDemo) {
    const res = await window.__manhalDemo.request('POST', path, body, headers);
    if (res.status >= 400) throw new ApiError(res.status, res.body?.error || '', res.body);
    for await (const ev of res.stream) onEvent(ev);
    return;
  }
  let res;
  try { res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body) }); } catch { throw new ApiError(0, ''); }
  if (!res.ok || !String(res.headers.get('content-type')).includes('text/event-stream')) {
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401) { store.me = null; store.csrf = null; }
    throw new ApiError(res.status, data?.error || '', data);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
      if (data) { try { onEvent(JSON.parse(data)); } catch { /* ignore a malformed event */ } }
    }
  }
}

export const get = path => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body) => api('PUT', path, body);
export const patch = (path, body) => api('PATCH', path, body);
export const del = path => api('DELETE', path);
