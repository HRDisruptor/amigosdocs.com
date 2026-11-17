import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { decryptFile, encryptFile, sniffMime } from '../src/filecrypto.js';
import { isEligible, rankHelpers, scoreHelper } from '../src/matching.js';
import { base32Encode, generateSecret, totpCode, verifyTotp } from '../src/totp.js';
import { displayName, norm } from '../src/util.js';

const request = { seeker_id: 1, doc_type: 'birth_certificate', country: 'CO', region: 'Cundinamarca', city: 'Bogotá', language: 'es' };
const helper = (overrides = {}) => ({
  id: 10, is_helper: true, status: 'active', available: true, helper_country: 'CO', helper_region: 'Cundinamarca',
  helper_city: 'Bogota', expertise: [], languages: [], verification: 'verified', rating: null, review_count: 0, completed_count: 0,
  ...overrides,
});

test('place names match without regard to accents, case, or spacing', () => {
  assert.equal(norm('  BOGOTÁ '), norm('bogota'));
  assert.equal(norm('São  Paulo'), 'sao paulo');
});

test('other members see a first name and a last initial only', () => {
  assert.equal(displayName('Ana María Gómez'), 'Ana María G.');
  assert.equal(displayName('Lucía'), 'Lucía');
});

test('a helper in another country is never eligible', () => {
  assert.equal(isEligible(request, helper({ helper_country: 'PE' })), false);
});

test('unverified, unavailable, or suspended helpers are not eligible', () => {
  assert.equal(isEligible(request, helper({ verification: 'pending' })), false);
  assert.equal(isEligible(request, helper({ verification: 'pending' }), { requireVerified: false }), true);
  assert.equal(isEligible(request, helper({ available: false })), false);
  assert.equal(isEligible(request, helper({ status: 'suspended' })), false);
});

test('a seeker cannot be matched with themselves', () => {
  assert.equal(isEligible(request, helper({ id: 1 })), false);
});

test('a helper in the same city outranks one elsewhere in the country', () => {
  const near = helper({ id: 10 });
  const far = helper({ id: 11, helper_city: 'Medellín', helper_region: 'Antioquia', expertise: ['birth_certificate'], languages: ['es'] });
  const ranked = rankHelpers(request, [far, near]);
  assert.deepEqual(ranked.map((m) => m.helper.id), [10, 11]);
  assert.ok(ranked[0].reasons.includes('same_city'));
});

test('expertise, language, and reputation each raise the score', () => {
  const base = scoreHelper(request, helper()).score;
  assert.ok(scoreHelper(request, helper({ expertise: ['birth_certificate'] })).score > base);
  assert.ok(scoreHelper(request, helper({ languages: ['es'] })).score > base);
  assert.ok(scoreHelper(request, helper({ rating: 5, review_count: 3 })).score > base);
  assert.ok(scoreHelper(request, helper({ completed_count: 4 })).score > base);
});

test('same region scores between same city and elsewhere', () => {
  const city = scoreHelper(request, helper()).score;
  const region = scoreHelper(request, helper({ helper_city: 'Soacha' })).score;
  const elsewhere = scoreHelper(request, helper({ helper_city: 'Cali', helper_region: 'Valle del Cauca' })).score;
  assert.ok(city > region && region > elsewhere);
});

test('passwords verify only against their own hash', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
});

test('one-time codes match the RFC 6238 reference values', () => {
  // RFC 6238 appendix B, SHA-1 rows, truncated to six digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpCode(secret, 59 * 1000), '287082');
  assert.equal(totpCode(secret, 1111111109 * 1000), '081804');
  assert.equal(totpCode(secret, 1234567890 * 1000), '005924');
});

test('a one-time code is accepted within one time step and rejected otherwise', () => {
  const secret = generateSecret();
  const now = Date.now();
  assert.equal(verifyTotp(secret, totpCode(secret, now), now), true);
  assert.equal(verifyTotp(secret, totpCode(secret, now - 30_000), now), true);
  assert.equal(verifyTotp(secret, totpCode(secret, now - 300_000), now), false);
  assert.equal(verifyTotp(secret, 'abcdef', now), false);
});

test('encrypted files round-trip and reject tampering', () => {
  const key = crypto.randomBytes(32);
  const sealed = encryptFile(key, Buffer.from('%PDF-1.7 private'));
  assert.equal(decryptFile(key, sealed).toString(), '%PDF-1.7 private');
  assert.notEqual(sealed.data.toString(), '%PDF-1.7 private');
  sealed.data[0] ^= 1;
  assert.throws(() => decryptFile(key, sealed));
});

test('file type comes from the content, not the name', () => {
  assert.equal(sniffMime(Buffer.from('%PDF-1.4')), 'application/pdf');
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('<html><script>')), null);
});
