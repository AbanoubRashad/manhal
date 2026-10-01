// Phase 1: email verification, password reset, language preference for emails.
export default {
  version: 2,
  name: 'email-tokens',
  up: db => db.exec(`
    ALTER TABLE users ADD COLUMN email_verified_at TEXT;
    ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
    CREATE TABLE email_tokens (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);
    CREATE TABLE email_log (
      id INTEGER PRIMARY KEY,
      to_addr TEXT NOT NULL,
      template TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `),
};
