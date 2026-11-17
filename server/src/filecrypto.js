import crypto from 'node:crypto';

// Shared files are encrypted before they reach the database (AES-256-GCM), so
// a copy of the database alone does not expose anyone's documents. This is
// encryption at rest with a server-held key. It is not end-to-end encryption,
// and the product should never claim that it is.

export function encryptFile(key, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), data };
}

export function decryptFile(key, { iv, tag, data }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  return Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
}

// Trust the file's own first bytes, not the name or type the browser claims.
export function sniffMime(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}
