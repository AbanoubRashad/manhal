import { randomToken, sha256 } from '../lib/crypto.js';
import { sqlTime, addMinutes } from '../lib/time.js';
import { badRequest } from '../lib/errors.js';

export const TTL = { verify: 60 * 24, reset: 60 };

/** Expiring, single-use email tokens. Only hashes are stored; issuing a new token voids older ones. */
export function tokensService({ db, now = () => new Date() }) {
  return {
    issue(userId, purpose) {
      const token = randomToken(32);
      db.tx(() => {
        db.run("UPDATE email_tokens SET used_at = datetime('now') WHERE user_id = ? AND purpose = ? AND used_at IS NULL", userId, purpose);
        db.run('INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
          userId, purpose, sha256(token), sqlTime(addMinutes(now(), TTL[purpose])));
      });
      return token;
    },
    /** Mark the token used and return its user id. Throws a friendly error if invalid, used or expired. */
    consume(token, purpose) {
      const bad = purpose === 'reset'
        ? 'This reset link is invalid or has expired. Request a new one.'
        : 'This confirmation link is invalid or has expired. Sign in and send a new one.';
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw badRequest(bad);
      const row = db.get('SELECT * FROM email_tokens WHERE token_hash = ? AND purpose = ?', sha256(token), purpose);
      if (!row || row.used_at || row.expires_at <= sqlTime(now())) throw badRequest(bad);
      const { changes } = db.run("UPDATE email_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL", row.id);
      if (!changes) throw badRequest(bad);
      return row.user_id;
    },
  };
}
