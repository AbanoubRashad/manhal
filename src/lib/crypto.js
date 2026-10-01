// All cryptography goes through this module so the browser demo can swap it
// for a Web Crypto version (see demo/crypto.js).
import { randomBytes, createHash, createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

/** URL-safe random token, e.g. for sessions and email links. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sha256 = text => createHash('sha256').update(String(text)).digest('hex');

export const hmacSha512 = (key, text) => createHmac('sha512', key).update(String(text)).digest('hex');

/** Constant-time comparison of two strings. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const N = 16384, R = 8, P = 1, LEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, LEN, { N, r: R, p: P }).toString('base64url');
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [alg, n, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const test = scryptSync(password, salt, LEN, { N: Number(n), r: R, p: P }).toString('base64url');
  return safeEqual(test, hash);
}
