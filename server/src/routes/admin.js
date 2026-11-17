import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireUser } from '../auth.js';
import { COUNTRIES, DOC_TYPES, LOCALES } from '../constants.js';
import { HttpError, displayName, parse, parseId } from '../util.js';

const text = (max) => z.string().trim().max(max);

const guideSchema = z.object({
  title: text(140).min(3),
  body: text(6000).min(10),
  language: z.enum(LOCALES),
  country: z.enum(COUNTRIES).nullable().default(null),
  docType: z.enum(DOC_TYPES).nullable().default(null),
  sourceUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/ }).max(500)]).default(''),
});

const guideJson = (g) => ({
  id: g.id, title: g.title, body: g.body, language: g.language, country: g.country, docType: g.doc_type, sourceUrl: g.source_url,
});

export function guideRoutes({ db }) {
  const router = Router();
  router.get('/guides', requireUser, async (_req, res) => {
    const rows = await db.query('SELECT * FROM guides ORDER BY country NULLS FIRST, id');
    res.json({ guides: rows.map(guideJson) });
  });
  return router;
}

export function adminRoutes({ db }) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/overview', async (_req, res) => {
    const [pending, reports, [counts]] = await Promise.all([
      db.query(
        `SELECT id, name, email, helper_country, helper_city, verification_note, created_at
         FROM users WHERE verification = 'pending' ORDER BY id`,
      ),
      db.query(
        `SELECT rp.*, a.name AS reporter_name, b.name AS reported_name, b.email AS reported_email, b.status AS reported_status
         FROM reports rp JOIN users a ON a.id = rp.reporter_id JOIN users b ON b.id = rp.reported_id
         WHERE rp.status = 'open' ORDER BY rp.id`,
      ),
      db.query(
        `SELECT (SELECT COUNT(*)::int FROM users) AS users,
                (SELECT COUNT(*)::int FROM users WHERE verification = 'verified') AS verified_helpers,
                (SELECT COUNT(*)::int FROM requests WHERE status = 'open') AS open_requests,
                (SELECT COUNT(*)::int FROM requests WHERE status = 'matched') AS matched_requests,
                (SELECT COUNT(*)::int FROM requests WHERE status = 'completed') AS completed_requests`,
      ),
    ]);
    res.json({
      counts: {
        users: counts.users, verifiedHelpers: counts.verified_helpers, openRequests: counts.open_requests,
        matchedRequests: counts.matched_requests, completedRequests: counts.completed_requests,
      },
      pendingVerifications: pending.map((u) => ({
        id: u.id, name: u.name, email: u.email, helperCountry: u.helper_country, helperCity: u.helper_city,
        note: u.verification_note, createdAt: u.created_at,
      })),
      reports: reports.map((r) => ({
        id: r.id, reason: r.reason, details: r.details, createdAt: r.created_at, threadId: r.thread_id,
        reporterName: displayName(r.reporter_name), reportedId: r.reported_id, reportedName: r.reported_name,
        reportedEmail: r.reported_email, reportedStatus: r.reported_status,
      })),
    });
  });

  router.post('/users/:id/verification', async (req, res) => {
    const { decision } = parse(z.object({ decision: z.enum(['verified', 'rejected']) }), req.body);
    const rows = await db.query('UPDATE users SET verification = $2 WHERE id = $1 AND is_helper RETURNING id', [parseId(req.params.id), decision]);
    if (!rows.length) throw new HttpError(404, 'not_found');
    res.json({ ok: true });
  });

  // Suspending signs the member out everywhere and removes them from matching.
  router.post('/users/:id/status', async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(['active', 'suspended']) }), req.body);
    const id = parseId(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'validation');
    const rows = await db.query('UPDATE users SET status = $2 WHERE id = $1 RETURNING id', [id, status]);
    if (!rows.length) throw new HttpError(404, 'not_found');
    if (status === 'suspended') await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    res.json({ ok: true });
  });

  router.post('/reports/:id/resolve', async (req, res) => {
    const rows = await db.query(
      `UPDATE reports SET status = 'resolved', resolved_at = now() WHERE id = $1 RETURNING id`,
      [parseId(req.params.id)],
    );
    if (!rows.length) throw new HttpError(404, 'not_found');
    res.json({ ok: true });
  });

  router.post('/guides', async (req, res) => {
    const g = parse(guideSchema, req.body);
    const [row] = await db.query(
      'INSERT INTO guides (title, body, language, country, doc_type, source_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [g.title, g.body, g.language, g.country, g.docType, g.sourceUrl],
    );
    res.status(201).json({ guide: guideJson(row) });
  });

  router.delete('/guides/:id', async (req, res) => {
    await db.query('DELETE FROM guides WHERE id = $1', [parseId(req.params.id)]);
    res.json({ ok: true });
  });

  return router;
}
