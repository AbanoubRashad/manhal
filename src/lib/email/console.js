/**
 * Development provider: logs each email and keeps the last 50 in memory so the
 * dev mailbox (/dev/mail) can show verification and reset links.
 * Links are only kept in memory, never written to the structured log.
 */
export function consoleProvider({ log, keep = 50 } = {}) {
  const outbox = [];
  return {
    name: 'console',
    outbox,
    async send(msg) {
      outbox.unshift({ ...msg, id: Date.now() + Math.random(), sentAt: new Date().toISOString() });
      outbox.length = Math.min(outbox.length, keep);
      log?.info('email (console provider)', { to: msg.to, subject: msg.subject, note: 'open /dev/mail to read it' });
    },
  };
}
