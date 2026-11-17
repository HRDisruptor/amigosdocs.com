// End-to-end tests of the HTTP API against an in-memory database. They follow
// the real journey: sign up, post a request, get matched, chat, share a file,
// finish, and review.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { cleanUp, ensureAdmin, ensureStarterGuides } from '../src/bootstrap.js';
import { createDb } from '../src/db.js';
import { totpCode } from '../src/totp.js';

const config = {
  production: false,
  rateLimit: false,
  requireVerifiedHelpers: true,
  fileKey: crypto.randomBytes(32),
  clientDist: '/nonexistent',
  adminEmail: 'boss@example.com',
  adminPassword: 'a-long-admin-password',
};

let db;
let server;
let base;

before(async () => {
  // Set TEST_DATABASE_URL to run the same tests against a real, empty Postgres database.
  db = await createDb(process.env.TEST_DATABASE_URL ? { databaseUrl: process.env.TEST_DATABASE_URL } : { memory: true });
  await ensureAdmin(db, config);
  await ensureStarterGuides(db);
  server = createApp({ db, config }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

// A tiny browser stand-in that remembers its session cookie.
function client() {
  let cookie = '';
  async function call(method, path, body, headers = {}) {
    const isRaw = Buffer.isBuffer(body);
    const res = await fetch(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? (isRaw ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body, headers) => call('POST', path, body ?? {}, headers),
    patch: (path, body) => call('PATCH', path, body),
    del: (path, body) => call('DELETE', path, body),
  };
}

async function signUp(name, email) {
  const c = client();
  const res = await c.post('/auth/signup', { email, password: 'a-good-password', name, locale: 'es', agree: true });
  assert.equal(res.status, 201);
  return Object.assign(c, { id: res.body.user.id });
}

const helperProfile = (name, city, extra = {}) => ({
  name, locale: 'es', residenceCountry: '', residenceCity: '', languages: ['es'], bio: '', isHelper: true,
  helperCountry: 'CO', helperRegion: 'Cundinamarca', helperCity: city, expertise: ['birth_certificate'], available: true, ...extra,
});

const state = {};

test('sign-up rejects weak passwords, missing consent, and duplicate emails', async () => {
  const c = client();
  const good = { email: 'dup@example.com', password: 'a-good-password', name: 'Dup User', agree: true };
  assert.equal((await c.post('/auth/signup', { ...good, password: 'short' })).status, 400);
  assert.equal((await c.post('/auth/signup', { ...good, agree: false })).status, 400);
  assert.equal((await c.post('/auth/signup', good)).status, 201);
  const again = await client().post('/auth/signup', { ...good, email: 'DUP@example.com' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'email_taken');
});

test('signed-out visitors cannot reach member data', async () => {
  const c = client();
  assert.equal((await c.get('/auth/me')).body.user, null);
  assert.equal((await c.get('/requests/mine')).status, 401);
  assert.equal((await c.get('/admin/overview')).status, 401);
});

test('requests from another website are refused', async () => {
  const res = await client().post('/auth/login', { email: 'x@example.com', password: 'x' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('login works, and wrong credentials reveal nothing', async () => {
  await signUp('Login Person', 'login@example.com');
  const c = client();
  const wrong = await c.post('/auth/login', { email: 'login@example.com', password: 'not-the-password' });
  const unknown = await c.post('/auth/login', { email: 'nobody@example.com', password: 'not-the-password' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  const ok = await c.post('/auth/login', { email: ' Login@Example.com ', password: 'a-good-password' });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/auth/me')).body.user.email, 'login@example.com');
  await c.post('/auth/logout');
  assert.equal((await c.get('/auth/me')).body.user, null);
});

test('two-factor authentication guards the next login', async () => {
  const c = await signUp('Two Factor', 'twofa@example.com');
  const { body: setup } = await c.post('/auth/2fa/setup');
  assert.match(setup.qr, /^data:image\/png/);
  assert.equal((await c.post('/auth/2fa/enable', { code: '000000' })).status, 400);
  assert.equal((await c.post('/auth/2fa/enable', { code: totpCode(setup.secret) })).status, 200);

  const fresh = client();
  const login = { email: 'twofa@example.com', password: 'a-good-password' };
  assert.equal((await fresh.post('/auth/login', login)).body.error, 'totp_required');
  assert.equal((await fresh.post('/auth/login', { ...login, code: '123456' })).body.error, 'totp_invalid');
  assert.equal((await fresh.post('/auth/login', { ...login, code: totpCode(setup.secret) })).status, 200);
});

test('a helper must be verified by an administrator before appearing in matches', async () => {
  state.seeker = await signUp('Lucía Ramírez', 'seeker@example.com');
  state.ana = await signUp('Ana María Gómez', 'ana@example.com');
  state.carlos = await signUp('Carlos Peña', 'carlos@example.com');
  assert.equal((await state.ana.patch('/me', helperProfile('Ana María Gómez', 'Bogotá'))).status, 200);
  assert.equal((await state.carlos.patch('/me', helperProfile('Carlos Peña', 'Medellín', { helperRegion: 'Antioquia' }))).status, 200);

  const created = await state.seeker.post('/requests', {
    docType: 'birth_certificate', country: 'CO', region: 'Cundinamarca', city: 'bogota', details: 'Registro civil de 1990.', urgency: 'high',
  });
  assert.equal(created.status, 201);
  state.requestId = created.body.request.id;

  assert.deepEqual((await state.seeker.get(`/requests/${state.requestId}/matches`)).body.matches, []);
  assert.equal((await state.ana.get('/requests/open')).body.blocked, 'verification');

  assert.equal((await state.ana.post('/me/verification', { note: 'Puedo hacer una videollamada cuando quieran.' })).status, 200);
  await state.carlos.post('/me/verification', { note: 'Trabajo con una organización local.' });

  const admin = client();
  assert.equal((await admin.post('/auth/login', { email: 'boss@example.com', password: 'a-long-admin-password' })).status, 200);
  const overview = await admin.get('/admin/overview');
  assert.equal(overview.body.pendingVerifications.length, 2);
  assert.equal((await state.ana.get('/admin/overview')).status, 403);
  for (const id of [state.ana.id, state.carlos.id]) {
    assert.equal((await admin.post(`/admin/users/${id}/verification`, { decision: 'verified' })).status, 200);
  }
  state.admin = admin;
});

test('matches are ranked with the same-city helper first, and names are shortened', async () => {
  const { body } = await state.seeker.get(`/requests/${state.requestId}/matches`);
  assert.deepEqual(body.matches.map((m) => m.helper.id), [state.ana.id, state.carlos.id]);
  assert.equal(body.matches[0].helper.name, 'Ana María G.');
  assert.ok(body.matches[0].reasons.includes('same_city'));
  assert.equal(body.matches[0].helper.email, undefined);
});

test('request details stay private until a helper is in a conversation', async () => {
  const open = await state.carlos.get('/requests/open');
  assert.equal(open.body.requests.length, 1);
  const peek = await state.carlos.get(`/requests/${state.requestId}`);
  assert.equal(peek.status, 200);
  assert.equal(peek.body.request.details, undefined);
  const stranger = await signUp('Not Involved', 'stranger@example.com');
  assert.equal((await stranger.get(`/requests/${state.requestId}`)).status, 404);
});

test('invite, chat, accept: the request becomes matched and other conversations close', async () => {
  const invite = await state.seeker.post(`/requests/${state.requestId}/threads`, { helperId: state.ana.id, message: 'Hola Ana, ¿puedes ayudarme?' });
  assert.equal(invite.status, 201);
  state.threadId = invite.body.threadId;
  const offer = await state.carlos.post(`/requests/${state.requestId}/threads`, { message: 'Puedo ayudar desde Medellín.' });
  state.carlosThreadId = offer.body.threadId;

  // The seeker started the conversation with Ana, so only Ana can accept it.
  assert.equal((await state.seeker.post(`/threads/${state.threadId}/accept`)).status, 409);

  const inbox = (await state.ana.get('/threads')).body.threads;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].unread, 1);
  assert.equal(inbox[0].needsMyAnswer, true);

  const view = await state.ana.get(`/threads/${state.threadId}`);
  assert.equal(view.body.request.details, 'Registro civil de 1990.');
  assert.equal(view.body.thread.canShareFiles, false);
  assert.equal((await state.ana.get('/threads')).body.threads[0].unread, 0);

  assert.equal((await state.ana.post(`/threads/${state.threadId}/messages`, { body: 'Claro, con gusto.' })).status, 201);
  assert.equal((await state.ana.post(`/threads/${state.threadId}/accept`)).status, 200);

  const request = (await state.seeker.get(`/requests/${state.requestId}`)).body;
  assert.equal(request.request.status, 'matched');
  assert.equal(request.request.helperId, state.ana.id);
  assert.equal(request.threads.find((t) => t.id === state.carlosThreadId).status, 'closed');
  assert.equal((await state.carlos.post(`/threads/${state.carlosThreadId}/messages`, { body: '¿Sigue abierto?' })).status, 409);
});

test('people outside a conversation cannot read it', async () => {
  assert.equal((await state.carlos.get(`/threads/${state.threadId}`)).status, 404);
  assert.equal((await state.carlos.post(`/threads/${state.threadId}/messages`, { body: 'hola' })).status, 404);
});

test('files are type-checked, stored encrypted, and visible only to the two participants', async () => {
  const pdf = Buffer.from('%PDF-1.4 carta de autorizacion');
  const upload = (who, body, name = 'carta.pdf') =>
    who.post(`/threads/${state.threadId}/files`, body, { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(name) });

  assert.equal((await upload(state.seeker, Buffer.from('<html>not a document</html>'))).status, 415);
  assert.equal((await upload(state.carlos, pdf)).status, 404);
  const ok = await upload(state.seeker, pdf, '../carta de autorización.pdf');
  assert.equal(ok.status, 201);
  assert.equal(ok.body.file.filename, '.._carta de autorización.pdf');

  const [stored] = await db.query('SELECT data FROM files WHERE id = $1', [ok.body.file.id]);
  assert.equal(Buffer.from(stored.data).includes(Buffer.from('carta')), false);

  const download = await state.ana.get(`/files/${ok.body.file.id}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.deepEqual(download.body, pdf);
  assert.equal((await state.carlos.get(`/files/${ok.body.file.id}`)).status, 404);

  await db.query(`UPDATE files SET expires_at = now() - interval '1 minute' WHERE id = $1`, [ok.body.file.id]);
  assert.equal((await state.ana.get(`/files/${ok.body.file.id}`)).status, 404);
  await cleanUp(db);
  assert.equal((await db.query('SELECT 1 FROM files')).length, 0);
});

test('the helper reports progress, the seeker confirms receipt, and both leave one review', async () => {
  assert.equal((await state.seeker.post(`/requests/${state.requestId}/step`, { step: 2 })).status, 404);
  assert.equal((await state.ana.post(`/requests/${state.requestId}/step`, { step: 3 })).body.request.step, 3);
  assert.equal((await state.ana.post(`/requests/${state.requestId}/reviews`, { rating: 5 })).status, 409);
  assert.equal((await state.ana.post(`/requests/${state.requestId}/complete`)).status, 404);
  assert.equal((await state.seeker.post(`/requests/${state.requestId}/complete`)).body.request.status, 'completed');

  assert.equal((await state.ana.get(`/threads/${state.threadId}`)).body.thread.canReview, true);
  assert.equal((await state.seeker.post(`/requests/${state.requestId}/reviews`, { rating: 5, comment: 'Excelente.' })).status, 201);
  assert.equal((await state.seeker.post(`/requests/${state.requestId}/reviews`, { rating: 1 })).status, 409);
  assert.equal((await state.ana.post(`/requests/${state.requestId}/reviews`, { rating: 4 })).status, 201);
  assert.equal((await state.carlos.post(`/requests/${state.requestId}/reviews`, { rating: 1 })).status, 404);

  const profile = (await state.seeker.get(`/users/${state.ana.id}`)).body;
  assert.equal(profile.user.rating, 5);
  assert.equal(profile.user.completedCount, 1);
  assert.equal(profile.reviews[0].comment, 'Excelente.');
});

test('a helper can step away from a matched request, which reopens it', async () => {
  const { body } = await state.seeker.post('/requests', { docType: 'apostille', country: 'CO', city: 'Medellín' });
  const { body: offer } = await state.carlos.post(`/requests/${body.request.id}/threads`, {});
  assert.equal((await state.carlos.post(`/threads/${offer.threadId}/accept`)).status, 409);
  assert.equal((await state.seeker.post(`/threads/${offer.threadId}/accept`)).status, 200);
  assert.equal((await state.carlos.post(`/requests/${body.request.id}/release`)).status, 200);
  const reopened = (await state.seeker.get(`/requests/${body.request.id}`)).body;
  assert.equal(reopened.request.status, 'open');
  assert.equal(reopened.request.helperId, null);
  assert.equal((await state.seeker.post(`/requests/${body.request.id}/cancel`)).body.request.status, 'cancelled');
});

test('a report reaches the administrator, and a suspended member is signed out', async () => {
  const report = await state.seeker.post('/reports', { threadId: state.carlosThreadId, reason: 'upfront_money', details: 'Pidió dinero por adelantado.' });
  assert.equal(report.status, 201);
  const { body } = await state.admin.get('/admin/overview');
  assert.equal(body.reports.length, 1);
  assert.equal(body.reports[0].reportedId, state.carlos.id);

  assert.equal((await state.admin.post(`/admin/users/${state.carlos.id}/status`, { status: 'suspended' })).status, 200);
  assert.equal((await state.carlos.get('/auth/me')).body.user, null);
  const login = await client().post('/auth/login', { email: 'carlos@example.com', password: 'a-good-password' });
  assert.equal(login.body.error, 'account_suspended');
  assert.equal((await state.admin.post(`/admin/reports/${body.reports[0].id}/resolve`)).status, 200);
});

test('guides can be read by members and managed only by administrators', async () => {
  assert.equal((await state.seeker.get('/guides')).body.guides.length, 3);
  const guide = { title: 'Registro civil en Colombia', body: 'Consulta el sitio oficial antes de ir.', language: 'es', country: 'CO', sourceUrl: 'https://www.example.org/' };
  assert.equal((await state.seeker.post('/admin/guides', guide)).status, 403);
  assert.equal((await state.admin.post('/admin/guides', { ...guide, sourceUrl: 'javascript:alert(1)' })).status, 400);
  const created = await state.admin.post('/admin/guides', guide);
  assert.equal(created.status, 201);
  assert.equal((await state.admin.del(`/admin/guides/${created.body.guide.id}`)).status, 200);
});

test('a member can export their data and delete their account', async () => {
  const exported = await state.seeker.get('/me/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.body.account.email, 'seeker@example.com');
  assert.ok(exported.body.requests.length >= 2);
  assert.equal(JSON.stringify(exported.body).includes('password'), false);

  assert.equal((await state.seeker.del('/me', { password: 'wrong-password' })).status, 401);
  assert.equal((await state.seeker.del('/me', { password: 'a-good-password' })).status, 200);
  assert.equal((await db.query('SELECT 1 FROM users WHERE email = $1', ['seeker@example.com'])).length, 0);
  assert.equal((await db.query('SELECT 1 FROM requests WHERE seeker_id = $1', [state.seeker.id])).length, 0);
});

test('the administrator account cannot be taken over by registering its email first', async () => {
  const fresh = await createDb({ memory: true });
  const squatter = { adminEmail: 'owner@example.com', adminPassword: 'the-real-admin-password' };
  await fresh.query(`INSERT INTO users (email, password_hash, name) VALUES ('owner@example.com', 'scrypt$x$y', 'Squatter')`);
  await ensureAdmin(fresh, squatter);
  const [row] = await fresh.query(`SELECT * FROM users WHERE email = 'owner@example.com'`);
  assert.equal(row.is_admin, true);
  assert.notEqual(row.password_hash, 'scrypt$x$y');
  await fresh.close();
});
