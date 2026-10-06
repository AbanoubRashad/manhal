// Claude Messages API client with a demo provider, streaming, prompt caching,
// timeouts, one retry, and a usage/cost log. Only the server calls it; the
// browser never sees the API key. Message text is never written to the logs.
import { sqlTime } from './time.js';

/** The AI is down, over budget or misconfigured. The message is safe to show. */
export class AiUnavailable extends Error {
  constructor(message = "Nour isn't available right now. Please try again in a few minutes.", code = 'ai_unavailable') {
    super(message);
    this.code = code;
  }
}

const API_VERSION = '2023-06-01';

export function createAi({ config, db, log, fetch = globalThis.fetch, now = () => new Date() }) {
  const c = config.ai;
  const MODELS = { chat: c.modelChat, fast: c.modelFast };
  const PRICES = { chat: c.priceChat, fast: c.priceFast };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const estimate = text => Math.ceil(String(text || '').length / 4);

  /** USD for one call. Cache writes cost 1.25x and cache reads 0.1x the input price. */
  function cost(kind, u) {
    const [pin, pout] = PRICES[kind];
    return (u.input * pin + u.cacheWrite * pin * 1.25 + u.cacheRead * pin * 0.1 + u.output * pout) / 1e6;
  }

  function record({ userId, feature, kind, usage, ms, ok, error }) {
    db.run(`INSERT INTO ai_usage (user_id, feature, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, ok, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, userId ?? null, feature, c.provider, MODELS[kind],
    usage.input, usage.output, usage.cacheRead, usage.cacheWrite, Math.round(cost(kind, usage) * 1e6) / 1e6, Math.round(ms), ok ? 1 : 0, error ?? null, sqlTime(now()));
    if (!ok) log.warn('ai call failed', { feature, model: MODELS[kind], error });
  }

  /** Build the request. Blocks marked `cache` get a prompt-caching breakpoint (max 4 per request). */
  function payload(kind, { system, messages, maxTokens, stream }) {
    return {
      model: MODELS[kind],
      max_tokens: Math.min(maxTokens || c.maxOutputTokens, c.maxOutputTokens),
      system: system.map(b => (b.cache ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } } : { type: 'text', text: b.text })),
      messages,
      ...(stream ? { stream: true } : {}),
    };
  }

  /** POST with a timeout and one retry on 429, 5xx or a network error. */
  async function post(body) {
    for (let attempt = 0; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), c.timeoutMs);
      let res;
      try {
        res = await fetch(`${c.baseUrl}/v1/messages`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'x-api-key': c.apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        clearTimeout(timer);
        if (attempt === 0) { await sleep(c.retryDelayMs); continue; }
        throw Object.assign(new AiUnavailable(), { detail: err.name === 'AbortError' ? 'timeout' : 'network' });
      }
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          const after = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 10_000) : c.retryDelayMs);
          continue;
        }
        throw Object.assign(new AiUnavailable(), { detail: `http ${res.status}` });
      }
      if (!res.ok) {
        let type = '';
        try { type = (await res.json())?.error?.type || ''; } catch { /* not JSON */ }
        throw Object.assign(new AiUnavailable(), { detail: `http ${res.status} ${type}`.trim() });
      }
      return res;
    }
  }

  const zero = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const fromApi = (u = {}, into = zero()) => {
    if (u.input_tokens != null) into.input = u.input_tokens;
    if (u.output_tokens != null) into.output = u.output_tokens;
    if (u.cache_read_input_tokens != null) into.cacheRead = u.cache_read_input_tokens;
    if (u.cache_creation_input_tokens != null) into.cacheWrite = u.cache_creation_input_tokens;
    return into;
  };
  const demoUsage = (req, text) => ({ input: estimate(req.system.map(b => b.text).join('') + JSON.stringify(req.messages)), output: estimate(text), cacheRead: 0, cacheWrite: 0 });

  return {
    models: MODELS,
    get provider() { return c.provider; },
    cost,

    /** Spending this calendar month (UTC) against the budget. */
    budget() {
      const start = sqlTime(now()).slice(0, 7) + '-01 00:00:00';
      const spent = db.get('SELECT COALESCE(SUM(cost_usd),0) AS s FROM ai_usage WHERE created_at >= ?', start).s;
      return { spent: Math.round(spent * 10000) / 10000, limit: c.monthlyBudgetUsd, ratio: c.monthlyBudgetUsd > 0 ? spent / c.monthlyBudgetUsd : 0 };
    },
    overBudget() { return this.budget().ratio >= 1; },

    /**
     * One-shot completion. req: { feature, kind: 'chat'|'fast', system: [{ text, cache }], messages, maxTokens, userId, demo }
     * `demo` builds the canned reply used when AI_PROVIDER=demo.
     */
    async complete(req) {
      const kind = req.kind || 'fast', t0 = Date.now();
      if (c.provider === 'demo') {
        const text = await req.demo();
        record({ userId: req.userId, feature: req.feature, kind, usage: demoUsage(req, text), ms: Date.now() - t0, ok: true });
        return { text };
      }
      try {
        const res = await post(payload(kind, req));
        const json = await res.json();
        const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        record({ userId: req.userId, feature: req.feature, kind, usage: fromApi(json.usage), ms: Date.now() - t0, ok: true });
        return { text };
      } catch (err) {
        record({ userId: req.userId, feature: req.feature, kind, usage: zero(), ms: Date.now() - t0, ok: false, error: err.detail || err.message });
        throw err instanceof AiUnavailable ? err : new AiUnavailable();
      }
    },

    /** Streamed completion: yields text pieces. Usage is logged when the stream ends, even if the reader stops early. */
    async *stream(req) {
      const kind = req.kind || 'chat', t0 = Date.now();
      if (c.provider === 'demo') {
        const text = await req.demo();
        try {
          for (const piece of text.match(/\S+\s*|\s+/g) || []) { yield piece; await sleep(c.demoDelayMs ?? 12); }
        } finally {
          record({ userId: req.userId, feature: req.feature, kind, usage: demoUsage(req, text), ms: Date.now() - t0, ok: true });
        }
        return;
      }
      const usage = zero();
      let ok = false, error = null, reader = null;
      try {
        const res = await post(payload(kind, { ...req, stream: true }));
        reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
            if (!data) continue;
            let ev;
            try { ev = JSON.parse(data); } catch { continue; }
            if (ev.type === 'message_start') fromApi(ev.message?.usage, usage);
            else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield ev.delta.text;
            else if (ev.type === 'message_delta') fromApi(ev.usage, usage);
            else if (ev.type === 'error') throw Object.assign(new AiUnavailable(), { detail: ev.error?.type || 'stream error' });
          }
        }
        ok = true;
      } catch (err) {
        error = err.detail || err.message;
        throw err instanceof AiUnavailable ? err : Object.assign(new AiUnavailable(), { detail: error });
      } finally {
        if (reader && !ok) reader.cancel().catch(() => {});
        // A stream the reader closed early still cost tokens; log what we know.
        record({ userId: req.userId, feature: req.feature, kind, usage, ms: Date.now() - t0, ok: ok || error === null, error });
      }
    },
  };
}
