import core from './001_core.js';
import email from './002_email.js';
import payments from './003_payments.js';
import video from './004_video.js';
import payouts from './005_payouts.js';

export const migrations = [core, email, payments, video, payouts];

/**
 * Apply pending migrations in order, each in its own transaction.
 * Never edit a migration that has shipped: add a new one instead.
 */
export function migrate(db, log) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const done = new Set(db.all('SELECT version FROM schema_migrations').map(r => r.version));
  const applied = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    db.tx(() => {
      m.up(db);
      db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', m.version, m.name);
    });
    applied.push(m.version);
    log?.info('migration applied', { version: m.version, name: m.name });
  }
  return applied;
}
