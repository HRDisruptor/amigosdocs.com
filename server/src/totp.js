import crypto from 'node:crypto';

// Time-based one-time passwords (RFC 6238), compatible with Google
// Authenticator, Authy, 1Password, and similar apps.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function base32Decode(text) {
  let bits = '';
  for (const char of text.toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret, atMs = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / STEP_SECONDS)));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest.at(-1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

// Accept the current code and the ones just before and after it, which
// tolerates a phone clock that is up to 30 seconds off.
export function verifyTotp(secret, code, atMs = Date.now()) {
  const candidate = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(candidate)) return false;
  return [-1, 0, 1].some((drift) => {
    const expected = totpCode(secret, atMs + drift * STEP_SECONDS * 1000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
  });
}

export function otpauthUrl(secret, email) {
  const label = encodeURIComponent(`AmigoDocs:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=AmigoDocs&algorithm=SHA1&digits=6&period=30`;
}
