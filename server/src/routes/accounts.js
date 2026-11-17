import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { hashPassword, verifyPassword, requireUser } from '../auth.js';
import { COUNTRIES, DOC_TYPES, LANGUAGES, LOCALES } from '../constants.js';
import { generateSecret, otpauthUrl, verifyTotp } from '../totp.js';
import { HttpError, USER_STATS, parse, parseId, privateUser, publicUser } from '../util.js';

const text = (max) => z.string().trim().max(max);

const signupSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(10).max(200),
  name: text(80).min(2),
  locale: z.enum(LOCALES).default('es'),
  agree: z.literal(true),
});

const loginSchema = z.object({
  email: z.string().max(200),
  password: z.string().max(200),
  code: z.string().max(10).optional(),
});

const profileSchema = z.object({
  name: text(80).min(2),
  locale: z.enum(LOCALES),
  residenceCountry: text(60),
  residenceCity: text(80),
  languages: z.array(z.enum(LANGUAGES)).max(LANGUAGES.length),
  bio: text(600),
  isHelper: z.boolean(),
  helperCountry: z.enum(COUNTRIES).nullable(),
  helperRegion: text(80),
  helperCity: text(80),
  expertise: z.array(z.enum(DOC_TYPES)).max(DOC_TYPES.length),
  available: z.boolean(),
});

export function accountRoutes({ db, sessions, authLimiter }) {
  const router = Router();
  // Checked when the email is unknown, so that response time does not reveal
  // whether an account exists.
  const decoyHash = hashPassword('decoy-password-never-used');

  router.post('/auth/signup', authLimiter, async (req, res) => {
    const body = parse(signupSchema, req.body);
    const email = body.email.toLowerCase();
    const hash = await hashPassword(body.password);
    let user;
    try {
      [user] = await db.query(
        'INSERT INTO users (email, password_hash, name, locale) VALUES ($1, $2, $3, $4) RETURNING *',
        [email, hash, body.name, body.locale],
      );
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'email_taken');
      throw err;
    }
    await sessions.start(res, user.id);
    res.status(201).json({ user: privateUser(user) });
  });

  router.post('/auth/login', authLimiter, async (req, res) => {
    const body = parse(loginSchema, req.body);
    const [user] = await db.query('SELECT * FROM users WHERE email = $1', [body.email.trim().toLowerCase()]);
    const passwordOk = await verifyPassword(body.password, user ? user.password_hash : await decoyHash);
    if (!user || !passwordOk) throw new HttpError(401, 'invalid_credentials');
    if (user.status !== 'active') throw new HttpError(403, 'account_suspended');
    if (user.totp_enabled) {
      if (!body.code) throw new HttpError(401, 'totp_required');
      if (!verifyTotp(user.totp_secret, body.code)) throw new HttpError(401, 'totp_invalid');
    }
    await sessions.start(res, user.id);
    res.json({ user: privateUser(user) });
  });

  router.post('/auth/logout', async (req, res) => {
    await sessions.end(req, res);
    res.json({ ok: true });
  });

  router.get('/auth/me', (req, res) => {
    res.json({ user: req.user ? privateUser(req.user) : null });
  });

  // Two-factor authentication: setup hands out a secret, and it only becomes
  // active once the member proves their authenticator app produces valid codes.
  router.post('/auth/2fa/setup', requireUser, async (req, res) => {
    if (req.user.totp_enabled) throw new HttpError(409, 'totp_already_enabled');
    const secret = generateSecret();
    await db.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, req.user.id]);
    const url = otpauthUrl(secret, req.user.email);
    res.json({ secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
  });

  router.post('/auth/2fa/enable', requireUser, authLimiter, async (req, res) => {
    const { code } = parse(z.object({ code: z.string().max(10) }), req.body);
    if (!req.user.totp_secret || !verifyTotp(req.user.totp_secret, code)) throw new HttpError(400, 'totp_invalid');
    await db.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  });

  router.post('/auth/2fa/disable', requireUser, authLimiter, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().max(200) }), req.body);
    if (!(await verifyPassword(password, req.user.password_hash))) throw new HttpError(401, 'invalid_credentials');
    await db.query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  });

  router.patch('/me', requireUser, async (req, res) => {
    const p = parse(profileSchema, req.body);
    if (p.isHelper && (!p.helperCountry || !p.helperCity)) throw new HttpError(400, 'validation', ['helperCountry', 'helperCity']);
    const [user] = await db.query(
      `UPDATE users SET name = $2, locale = $3, residence_country = $4, residence_city = $5,
         languages = $6::text[], bio = $7, is_helper = $8, helper_country = $9, helper_region = $10,
         helper_city = $11, expertise = $12::text[], available = $13
       WHERE id = $1 RETURNING *`,
      [req.user.id, p.name, p.locale, p.residenceCountry, p.residenceCity, p.languages, p.bio, p.isHelper,
        p.helperCountry, p.helperRegion, p.helperCity, p.expertise, p.available],
    );
    res.json({ user: privateUser(user) });
  });

  // A helper asks to be verified. No identity document is uploaded or stored:
  // an administrator confirms identity outside the app (for example on a video
  // call or through a partner organization) and then records the decision.
  router.post('/me/verification', requireUser, async (req, res) => {
    const { note } = parse(z.object({ note: text(600).min(10) }), req.body);
    if (!req.user.is_helper) throw new HttpError(400, 'helper_profile_required');
    if (req.user.verification === 'verified') throw new HttpError(409, 'already_verified');
    const [user] = await db.query(
      `UPDATE users SET verification = 'pending', verification_note = $2 WHERE id = $1 RETURNING *`,
      [req.user.id, note],
    );
    res.json({ user: privateUser(user) });
  });

  // Data portability (GDPR article 20, LGPD article 18): everything the
  // member has given us, in one machine-readable file.
  router.get('/me/export', requireUser, async (req, res) => {
    const id = req.user.id;
    const [requests, messages, reviewsWritten, reviewsReceived, reports] = await Promise.all([
      db.query('SELECT * FROM requests WHERE seeker_id = $1 OR helper_id = $1 ORDER BY id', [id]),
      db.query('SELECT id, thread_id, body, created_at FROM messages WHERE sender_id = $1 ORDER BY id', [id]),
      db.query('SELECT * FROM reviews WHERE reviewer_id = $1 ORDER BY id', [id]),
      db.query('SELECT request_id, rating, comment, created_at FROM reviews WHERE reviewee_id = $1 ORDER BY id', [id]),
      db.query('SELECT id, reason, details, status, created_at FROM reports WHERE reporter_id = $1 ORDER BY id', [id]),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="amigodocs-my-data.json"');
    res.json({ exportedAt: new Date(), account: privateUser(req.user), requests, messages, reviewsWritten, reviewsReceived, reports });
  });

  // Right to erasure. Requests this member was helping with go back to "open"
  // so the seekers are not left stranded.
  router.delete('/me', requireUser, async (req, res) => {
    const { password } = parse(z.object({ password: z.string().max(200) }), req.body);
    if (!(await verifyPassword(password, req.user.password_hash))) throw new HttpError(401, 'invalid_credentials');
    await db.tx(async (q) => {
      await q.query(
        `UPDATE requests SET status = 'open', helper_id = NULL, step = 0, updated_at = now()
         WHERE helper_id = $1 AND status = 'matched'`,
        [req.user.id],
      );
      await q.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    });
    await sessions.end(req, res);
    res.json({ ok: true });
  });

  router.get('/users/:id', requireUser, async (req, res) => {
    const id = parseId(req.params.id);
    const [user] = await db.query(`SELECT u.*, ${USER_STATS} FROM users u WHERE u.id = $1 AND u.status = 'active'`, [id]);
    if (!user) throw new HttpError(404, 'not_found');
    const reviews = await db.query(
      `SELECT rv.rating, rv.comment, rv.created_at, rq.doc_type
       FROM reviews rv JOIN requests rq ON rq.id = rv.request_id
       WHERE rv.reviewee_id = $1 ORDER BY rv.id DESC LIMIT 30`,
      [id],
    );
    res.json({
      user: publicUser(user),
      reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.created_at, docType: r.doc_type })),
    });
  });

  return router;
}
