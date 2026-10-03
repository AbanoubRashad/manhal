// Consistent online backup of the SQLite database using VACUUM INTO.
// Usage: npm run backup   (schedule it with cron / Task Scheduler, e.g. nightly)
import { mkdirSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/lib/log.js';

export function backup({ databasePath, dir, keep, now = new Date() }) {
  if (!existsSync(databasePath)) throw new Error(`Database not found at ${databasePath}`);
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const target = resolve(join(dir, `manhal-${stamp}.db`));
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const check = new DatabaseSync(target);
    const ok = check.prepare('PRAGMA integrity_check').get();
    check.close();
    if (Object.values(ok)[0] !== 'ok') throw new Error('Integrity check failed on the backup file.');
  } finally {
    db.close();
  }
  const files = readdirSync(dir).filter(f => /^manhal-\d{8}-\d{6}\.db$/.test(f)).sort();
  const removed = files.slice(0, Math.max(0, files.length - keep));
  removed.forEach(f => rmSync(join(dir, f)));
  return { file: target, bytes: statSync(target).size, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const log = createLogger({ level: config.logLevel, base: { service: 'manhal-backup' } });
  try {
    const r = backup({ databasePath: config.databasePath, dir: config.backup.dir, keep: config.backup.keep });
    log.info('backup written', r);
  } catch (err) {
    log.error('backup failed', { err });
    process.exitCode = 1;
  }
}
