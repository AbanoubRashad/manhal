import { randomToken, sha256 } from '../lib/crypto.js';
import { sqlTime, addMinutes } from '../lib/time.js';

const DAYS_30 = 60 * 24 * 30;

/** Server-side sessions. Only a hash of the cookie token is stored. */
export function sessionsService({ db, now = () => new Date() }) {
  return {
    maxAgeSeconds: DAYS_30 * 60,
    create(userId) {
      const token = randomToken(32), csrf = randomToken(24);
      db.run('INSERT INTO sessions (token_hash, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)',
        sha256(token), userId, csrf, sqlTime(addMinutes(now(), DAYS_30)));
      return { token, csrf };
    },
    /** Returns { session, user } for a valid token, or null. */
    lookup(token) {
      if (!token || token.length > 100) return null;
      const s = db.get('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', sha256(token), sqlTime(now()));
      if (!s) return null;
      const user = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
      return user ? { session: s, user } : null;
    },
    destroy(token) { if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token)); },
    /** Sign the user out everywhere, optionally keeping the current session. */
    destroyAll(userId, exceptToken) {
      db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, exceptToken ? sha256(exceptToken) : '');
    },
    purgeExpired() { return db.run('DELETE FROM sessions WHERE expires_at <= ?', sqlTime(now())).changes; },
  };
}
