import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations/index.js';
import { backup } from '../scripts/backup.js';

test('backup writes a consistent copy and keeps only the newest files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manhal-bk-'));
  try {
    const dbPath = join(dir, 'live.db');
    const db = openDb(dbPath);
    migrate(db);
    db.run("INSERT INTO users (email, name, password_hash) VALUES ('a@b.co', 'A', 'x')");
    const out = join(dir, 'backups');
    for (let i = 0; i < 4; i++) backup({ databasePath: dbPath, dir: out, keep: 2, now: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
    db.close();
    const files = readdirSync(out);
    assert.deepEqual(files, ['manhal-20260101-000002.db', 'manhal-20260101-000003.db']);
    const copy = new DatabaseSync(join(out, files[1]));
    assert.equal(copy.prepare('SELECT email FROM users').get().email, 'a@b.co');
    copy.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
