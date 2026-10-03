// The src/db.js interface on top of sql.js (SQLite compiled to WebAssembly).

const clean = v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function wrapSqlJs(raw) {
  let cache = new Map();
  const stmt = sql => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const bind = (s, params) => { s.reset(); if (params.length) s.bind(params.map(clean)); return s; };
  const pragmas = () => raw.exec('PRAGMA foreign_keys = ON;');
  pragmas();
  let depth = 0;
  const db = {
    raw,
    get(sql, ...p) { const s = bind(stmt(sql), p); const row = s.step() ? s.getAsObject() : undefined; s.reset(); return row; },
    all(sql, ...p) { const s = bind(stmt(sql), p); const rows = []; while (s.step()) rows.push(s.getAsObject()); s.reset(); return rows; },
    run(sql, ...p) {
      const s = bind(stmt(sql), p);
      s.step(); s.reset();
      return { changes: raw.getRowsModified(), id: Number(raw.exec('SELECT last_insert_rowid()')[0].values[0][0]) };
    },
    exec: sql => raw.exec(sql),
    tx(fn) {
      const sp = `sp${depth}`;
      raw.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      depth++;
      try {
        const out = fn();
        depth--;
        raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        return out;
      } catch (e) {
        depth--;
        raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      }
    },
    /** Serialise the database. sql.js frees prepared statements on export, so the cache is reset. */
    export() {
      const bytes = raw.export();
      cache = new Map();
      pragmas();
      return bytes;
    },
  };
  return db;
}
