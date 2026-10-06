// Browser replacement for src/lib/crypto.js, used only by the static demo build.
// Same exports and signatures. Password hashing here is NOT production-grade:
// the demo database lives in the visitor's own browser.

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

// Compact synchronous SHA-256 (Web Crypto is async-only).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

export const sha256 = text => hex(sha256Bytes(new TextEncoder().encode(String(text))));
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

function sha256Bytes(msg) {
  const len = msg.length, total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg); buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, len * 8); view.setUint32(total - 8, Math.floor(len / 0x20000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), dv = new DataView(out.buffer);
  H.forEach((x, i) => dv.setUint32(i * 4, x));
  return out;
}

/** HMAC-SHA256 over UTF-8 text (RFC 2104). */
export function hmacSha256(key, text) {
  const enc = new TextEncoder();
  let k = enc.encode(String(key));
  if (k.length > 64) k = sha256Bytes(k);
  const pad = n => { const b = new Uint8Array(64); b.set(k); return b.map(x => x ^ n); };
  const join = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  return hex(sha256Bytes(join(pad(0x5c), sha256Bytes(join(pad(0x36), enc.encode(String(text)))))));
}

export function hmacSha512() { throw new Error('Paymob signatures are not available in the browser demo.'); }

export const safeEqual = (a, b) => String(a) === String(b);

export function hashPassword(password) {
  const salt = randomToken(12);
  let h = salt + password;
  for (let i = 0; i < 500; i++) h = sha256(h);
  return `demo$500$${salt}$${h}`;
}
export function verifyPassword(password, stored) {
  const [alg, n, salt, hash] = String(stored || '').split('$');
  if (alg !== 'demo' || !salt) return false;
  let h = salt + password;
  for (let i = 0; i < Number(n); i++) h = sha256(h);
  return h === hash;
}
