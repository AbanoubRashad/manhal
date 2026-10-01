import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Thin wrapper over node:sqlite. The browser demo provides the same interface
 * on top of SQLite compiled to WebAssembly (demo/db.js), so services stay portable.
 */
export function openDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL;');
  return wrap(raw);
}

export function wrap(raw) {
  const cache = new Map();
  const stmt = sql => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const plain = row => (row ? { ...row } : undefined);
  let depth = 0;
  const db = {
    raw,
    get: (sql, ...params) => plain(stmt(sql).get(...params)),
    all: (sql, ...params) => stmt(sql).all(...params).map(plain),
    run: (sql, ...params) => {
      const r = stmt(sql).run(...params);
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    exec: sql => raw.exec(sql),
    /** Run fn inside a transaction (nested calls use savepoints). */
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
    close: () => raw.close(),
  };
  return db;
}
