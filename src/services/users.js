import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { conflict, badRequest, notFound } from '../lib/errors.js';

/** The fields of a user that are safe to send to the browser. */
export const publicUser = u => u && ({
  id: u.id, email: u.email, name: u.name, role: u.role, lang: u.lang,
  headline: u.headline, bio: u.bio, emailVerified: Boolean(u.email_verified_at), createdAt: u.created_at,
});

export function usersService({ db }) {
  const byId = id => db.get('SELECT * FROM users WHERE id = ?', id);
  const byEmail = email => db.get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase());
  return {
    byId, byEmail,
    create({ email, name, password, role = 'learner', lang = 'en', headline = '', verified = false }) {
      if (byEmail(email)) throw conflict('An account with this email already exists. Try signing in instead.');
      const { id } = db.run(
        `INSERT INTO users (email, name, password_hash, role, lang, headline, email_verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ${verified ? "datetime('now')" : 'NULL'})`,
        email.toLowerCase(), name, hashPassword(password), role, lang, headline);
      return byId(id);
    },
    checkPassword(email, password) {
      const u = byEmail(email);
      // Hash anyway when the user doesn't exist so timing doesn't reveal which emails are registered.
      const ok = verifyPassword(password, u?.password_hash || 'scrypt$16384$c2FsdA$aGFzaA');
      return ok && u ? u : null;
    },
    updateProfile(id, { name, lang, headline, bio }) {
      const u = byId(id);
      if (!u) throw notFound();
      db.run('UPDATE users SET name = ?, lang = ?, headline = ?, bio = ? WHERE id = ?',
        name ?? u.name, lang ?? u.lang, headline ?? u.headline, bio ?? u.bio, id);
      return byId(id);
    },
    setPassword(id, password) {
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), id);
    },
    changePassword(id, current, next) {
      const u = byId(id);
      if (!verifyPassword(current, u.password_hash)) throw badRequest('Your current password is not correct.', { fields: { current: 'Your current password is not correct.' } });
      this.setPassword(id, next);
    },
    markVerified(id) {
      db.run("UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ?", id);
    },
  };
}
