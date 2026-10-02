import { unauthorized } from '../lib/errors.js';

/** Sign-up, sign-in, email verification and password reset. */
export function authService({ config, users, sessions, tokens, mailer }) {
  const link = (path, token) => `${config.baseUrl}${path}?token=${encodeURIComponent(token)}`;

  async function sendVerification(user) {
    const token = tokens.issue(user.id, 'verify');
    await mailer.send('verify', user.email, { name: user.name, url: link('/verify-email', token) }, user.lang);
  }

  return {
    sendVerification,
    async register({ name, email, password, lang }) {
      const user = users.create({ name, email, password, lang });
      await sendVerification(user);
      return { user, ...sessions.create(user.id) };
    },
    login({ email, password }) {
      const user = users.checkPassword(email, password);
      if (!user) throw unauthorized("That email and password don't match. Check them and try again.");
      return { user, ...sessions.create(user.id) };
    },
    verifyEmail(token) {
      const userId = tokens.consume(token, 'verify');
      users.markVerified(userId);
      return users.byId(userId);
    },
    /** Always succeeds from the caller's point of view, so it can't be used to discover accounts. */
    async forgot(email) {
      const user = users.byEmail(email);
      if (!user) return;
      const token = tokens.issue(user.id, 'reset');
      await mailer.send('reset', user.email, { name: user.name, url: link('/reset-password', token) }, user.lang);
    },
    /** Set a new password and sign out every existing session. */
    reset(token, password) {
      const userId = tokens.consume(token, 'reset');
      users.setPassword(userId, password);
      users.markVerified(userId); // they proved they own the inbox
      sessions.destroyAll(userId);
      return users.byId(userId);
    },
  };
}
