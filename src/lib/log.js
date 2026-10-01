// Structured JSON logging: one line per event, secrets redacted.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET = /pass(word)?|token|secret|hmac|authorization|cookie|api_?key|client_secret/i;

export function redact(value, depth = 0) {
  if (value == null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

export function createLogger({ level = 'info', write = line => process.stdout.write(line + '\n'), base = {} } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, msg, fields) => {
    if (LEVELS[lvl] < min) return;
    const entry = { ts: new Date().toISOString(), level: lvl, msg, ...base, ...redact(fields || {}) };
    if (fields?.err instanceof Error) entry.err = { message: fields.err.message, stack: fields.err.stack };
    write(JSON.stringify(entry));
  };
  return {
    debug: (m, f) => emit('debug', m, f), info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f), error: (m, f) => emit('error', m, f),
    child: extra => createLogger({ level, write, base: { ...base, ...extra } }),
  };
}

/** A logger that keeps entries in memory, for tests. */
export function memoryLogger() {
  const lines = [];
  const log = createLogger({ level: 'debug', write: l => lines.push(JSON.parse(l)) });
  log.lines = lines;
  return log;
}
