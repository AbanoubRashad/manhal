// Phase 4: revenue share setting, instructor earnings ledger and payout requests.
export default {
  version: 5,
  name: 'payouts',
  up: db => db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO settings (key, value) VALUES ('revenue_share', '0.70');
    CREATE TABLE earnings (
      id INTEGER PRIMARY KEY,
      instructor_id INTEGER NOT NULL REFERENCES users(id),
      order_id INTEGER NOT NULL REFERENCES orders(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      kind TEXT NOT NULL CHECK (kind IN ('sale','refund')),
      gross INTEGER NOT NULL,
      share REAL NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (order_id, course_id, kind)
    );
    CREATE INDEX earnings_instructor ON earnings(instructor_id);
    CREATE TABLE payouts (
      id INTEGER PRIMARY KEY,
      instructor_id INTEGER NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      method TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','rejected')),
      admin_note TEXT NOT NULL DEFAULT '',
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT
    );
    CREATE INDEX payouts_instructor ON payouts(instructor_id);
  `),
};
