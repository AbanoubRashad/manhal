import { existsSync } from 'node:fs';

// Load .env without dependencies (Node 21.7+). Real environment variables win.
if (existsSync('.env')) {
  try { process.loadEnvFile('.env'); } catch { /* malformed .env: fall back to the environment */ }
}

/** Build the runtime config from an env object. Exported for tests. */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  const config = {
    production,
    port: Number(env.PORT) || 3000,
    baseUrl: (env.BASE_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
    databasePath: env.DATABASE_PATH || 'data/manhal.db',
    seedDemo: env.SEED_DEMO ? env.SEED_DEMO === 'true' : !production,
    logLevel: env.LOG_LEVEL || 'info',
    email: {
      provider: env.EMAIL_PROVIDER || 'console',
      from: env.EMAIL_FROM || 'Manhal <hello@example.com>',
      resendKey: env.RESEND_API_KEY || '',
    },
    payments: {
      provider: env.PAYMENTS_PROVIDER || 'demo',
      paymob: {
        baseUrl: (env.PAYMOB_BASE_URL || 'https://accept.paymob.com').replace(/\/$/, ''),
        secretKey: env.PAYMOB_SECRET_KEY || '',
        publicKey: env.PAYMOB_PUBLIC_KEY || '',
        hmacSecret: env.PAYMOB_HMAC_SECRET || '',
        integrationIds: list(env.PAYMOB_INTEGRATION_IDS).map(Number).filter(Number.isFinite),
      },
    },
    video: {
      bunnyLibraryId: env.BUNNY_LIBRARY_ID || '',
      bunnyTokenKey: env.BUNNY_TOKEN_KEY || '',
      ttl: Number(env.VIDEO_URL_TTL) || 7200,
    },
    backup: { dir: env.BACKUP_DIR || 'data/backups', keep: Number(env.BACKUP_KEEP) || 14 },
  };
  return config;
}

/** Problems that must stop a production boot. Returns plain-language messages. */
export function configProblems(config) {
  const out = [];
  if (!config.production) return out;
  if (config.email.provider === 'console') out.push('EMAIL_PROVIDER=console is for development. Set EMAIL_PROVIDER=resend and RESEND_API_KEY.');
  if (config.email.provider === 'resend' && !config.email.resendKey) out.push('RESEND_API_KEY is missing.');
  if (config.payments.provider === 'demo') out.push('PAYMENTS_PROVIDER=demo enrolls people without paying. Set PAYMENTS_PROVIDER=paymob.');
  if (config.payments.provider === 'paymob') {
    const p = config.payments.paymob;
    if (!p.secretKey || !p.publicKey || !p.hmacSecret || !p.integrationIds.length) out.push('Paymob needs PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC_SECRET and PAYMOB_INTEGRATION_IDS.');
  }
  if (!config.baseUrl.startsWith('https://')) out.push('BASE_URL should be your public https:// address.');
  return out;
}
