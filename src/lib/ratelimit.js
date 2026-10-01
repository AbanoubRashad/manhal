import { tooMany } from './errors.js';

/** In-memory fixed-window limiter. Good enough for a single server process. */
export function createLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();
  return {
    hit(key) {
      const t = now();
      const e = hits.get(key);
      if (!e || t - e.start >= windowMs) { hits.set(key, { start: t, n: 1 }); return; }
      if (++e.n > limit) throw tooMany();
      if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
    },
    reset: key => hits.delete(key),
  };
}
