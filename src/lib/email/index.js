import { render } from './templates.js';
import { consoleProvider } from './console.js';
import { resendProvider } from './resend.js';

/**
 * Email module. A provider is { name, send({ from, to, subject, html, text }) -> Promise }.
 * "console" logs emails (development); "resend" calls the Resend API with fetch.
 */
export function createProvider(config, { log, fetch = globalThis.fetch } = {}) {
  const p = config.email.provider;
  if (p === 'resend') return resendProvider({ apiKey: config.email.resendKey, fetch });
  if (p === 'console') return consoleProvider({ log });
  throw new Error(`Unknown EMAIL_PROVIDER "${p}". Use "console" or "resend".`);
}

export function createMailer({ config, provider, db, log }) {
  return {
    provider,
    /** Render and send. Never throws: a failed email is logged and recorded, not fatal. */
    async send(template, to, data, lang = 'en') {
      const msg = render(template, lang, data);
      try {
        await provider.send({ from: config.email.from, to, ...msg });
        db?.run('INSERT INTO email_log (to_addr, template, provider, status) VALUES (?, ?, ?, ?)', to, template, provider.name, 'sent');
        log?.info('email sent', { template, provider: provider.name });
        return true;
      } catch (err) {
        db?.run('INSERT INTO email_log (to_addr, template, provider, status, error) VALUES (?, ?, ?, ?, ?)', to, template, provider.name, 'failed', String(err.message).slice(0, 300));
        log?.error('email failed', { template, provider: provider.name, err });
        return false;
      }
    },
  };
}
