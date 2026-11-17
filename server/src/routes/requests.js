import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { COUNTRIES, DOC_TYPES, LANGUAGES, MAX_OPEN_REQUESTS, URGENCIES } from '../constants.js';
import { isEligible, rankHelpers } from '../matching.js';
import { HttpError, USER_STATS, norm, parse, parseId, publicUser, requestSummary } from '../util.js';

const text = (max) => z.string().trim().max(max);

const requestSchema = z.object({
  docType: z.enum(DOC_TYPES),
  country: z.enum(COUNTRIES),
  region: text(80).default(''),
  city: text(80).min(2),
  details: text(1500).default(''),
  urgency: z.enum(URGENCIES).default('normal'),
  language: z.enum(LANGUAGES).default('es'),
  thanks: text(200).default(''),
});

const URGENCY_RANK = { emergency: 0, high: 1, normal: 2, low: 3 };

export function requestRoutes({ db, config }) {
  const router = Router();
  router.use(requireUser);
  const requireVerified = config.requireVerifiedHelpers;

  async function loadRequest(id) {
    const [request] = await db.query('SELECT * FROM requests WHERE id = $1', [parseId(id)]);
    if (!request) throw new HttpError(404, 'not_found');
    return request;
  }

  router.post('/requests', async (req, res) => {
    const b = parse(requestSchema, req.body);
    const [{ open }] = await db.query(
      `SELECT COUNT(*)::int AS open FROM requests WHERE seeker_id = $1 AND status IN ('open', 'matched')`,
      [req.user.id],
    );
    if (open >= MAX_OPEN_REQUESTS) throw new HttpError(409, 'too_many_requests');
    const [request] = await db.query(
      `INSERT INTO requests (seeker_id, doc_type, country, region, city, details, urgency, language, thanks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, b.docType, b.country, b.region, b.city, b.details, b.urgency, b.language, b.thanks],
    );
    res.status(201).json({ request: requestSummary(request, { withDetails: true }) });
  });

  router.get('/requests/mine', async (req, res) => {
    const rows = await db.query(
      `SELECT r.*,
         (SELECT COUNT(*)::int FROM threads t WHERE t.request_id = r.id AND t.status = 'pending') AS pending_threads
       FROM requests r WHERE r.seeker_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [req.user.id],
    );
    res.json({ requests: rows.map((r) => ({ ...requestSummary(r), pendingThreads: r.pending_threads })) });
  });

  // Open requests a helper could take: same country, nearest first, then most urgent.
  router.get('/requests/open', async (req, res) => {
    const me = req.user;
    if (!me.is_helper || !me.helper_country) return res.json({ requests: [], blocked: 'helper_profile' });
    if (requireVerified && me.verification !== 'verified') return res.json({ requests: [], blocked: 'verification' });
    const rows = await db.query(
      `SELECT r.*, t.id AS my_thread_id
       FROM requests r LEFT JOIN threads t ON t.request_id = r.id AND t.helper_id = $1
       WHERE r.status = 'open' AND r.country = $2 AND r.seeker_id <> $1
       ORDER BY r.created_at DESC LIMIT 200`,
      [me.id, me.helper_country],
    );
    const nearness = (r) => (norm(r.city) === norm(me.helper_city) ? 0 : norm(r.region) && norm(r.region) === norm(me.helper_region) ? 1 : 2);
    rows.sort((a, b) => nearness(a) - nearness(b) || URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
    res.json({
      requests: rows.map((r) => ({ ...requestSummary(r), myThreadId: r.my_thread_id, sameCity: nearness(r) === 0 })),
    });
  });

  // The free-text details can contain personal information, so they are shown
  // only to the seeker and to a helper who is already in a conversation about
  // this request. Other eligible helpers see the summary.
  router.get('/requests/:id', async (req, res) => {
    const request = await loadRequest(req.params.id);
    const me = req.user;
    if (request.seeker_id === me.id) {
      const threads = await db.query(
        `SELECT t.id, t.status, t.initiated_by, t.helper_id FROM threads t WHERE t.request_id = $1 ORDER BY t.updated_at DESC`,
        [request.id],
      );
      const helpers = threads.length
        ? await db.query(`SELECT u.*, ${USER_STATS} FROM users u WHERE u.id = ANY($1::int[])`, [threads.map((t) => t.helper_id)])
        : [];
      const byId = new Map(helpers.map((h) => [h.id, h]));
      return res.json({
        role: 'seeker',
        request: requestSummary(request, { withDetails: true }),
        threads: threads
          .filter((t) => byId.has(t.helper_id))
          .map((t) => ({ id: t.id, status: t.status, initiatedBy: t.initiated_by, helper: publicUser(byId.get(t.helper_id)) })),
      });
    }
    const [thread] = await db.query('SELECT id, status FROM threads WHERE request_id = $1 AND helper_id = $2', [request.id, me.id]);
    if (thread) {
      return res.json({ role: 'helper', request: requestSummary(request, { withDetails: true }), myThreadId: thread.id });
    }
    if (request.status === 'open' && isEligible(request, me, { requireVerified })) {
      return res.json({ role: 'helper', request: requestSummary(request), myThreadId: null });
    }
    throw new HttpError(404, 'not_found');
  });

  router.get('/requests/:id/matches', async (req, res) => {
    const request = await loadRequest(req.params.id);
    if (request.seeker_id !== req.user.id) throw new HttpError(404, 'not_found');
    if (request.status !== 'open') return res.json({ matches: [] });
    const helpers = await db.query(
      `SELECT u.*, ${USER_STATS} FROM users u
       WHERE u.is_helper AND u.status = 'active' AND u.available AND u.helper_country = $1
         AND u.id NOT IN (SELECT helper_id FROM threads WHERE request_id = $2)`,
      [request.country, request.id],
    );
    const ranked = rankHelpers(request, helpers, { requireVerified });
    res.json({ matches: ranked.map((m) => ({ helper: publicUser(m.helper), score: m.score, reasons: m.reasons })) });
  });

  // The helper reports progress on a matched request (steps 1 to 4).
  router.post('/requests/:id/step', async (req, res) => {
    const { step } = parse(z.object({ step: z.number().int().min(1).max(4) }), req.body);
    const request = await loadRequest(req.params.id);
    if (request.helper_id !== req.user.id) throw new HttpError(404, 'not_found');
    if (request.status !== 'matched') throw new HttpError(409, 'wrong_status');
    const [updated] = await db.query('UPDATE requests SET step = $2, updated_at = now() WHERE id = $1 RETURNING *', [request.id, step]);
    res.json({ request: requestSummary(updated, { withDetails: true }) });
  });

  // The seeker confirms the document arrived, which completes the request.
  router.post('/requests/:id/complete', async (req, res) => {
    const request = await loadRequest(req.params.id);
    if (request.seeker_id !== req.user.id) throw new HttpError(404, 'not_found');
    if (request.status !== 'matched') throw new HttpError(409, 'wrong_status');
    const [updated] = await db.query(
      `UPDATE requests SET status = 'completed', step = 5, completed_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [request.id],
    );
    res.json({ request: requestSummary(updated, { withDetails: true }) });
  });

  router.post('/requests/:id/cancel', async (req, res) => {
    const request = await loadRequest(req.params.id);
    if (request.seeker_id !== req.user.id) throw new HttpError(404, 'not_found');
    if (!['open', 'matched'].includes(request.status)) throw new HttpError(409, 'wrong_status');
    const updated = await db.tx(async (q) => {
      await q.query(`UPDATE threads SET status = 'closed', updated_at = now() WHERE request_id = $1 AND status = 'pending'`, [request.id]);
      const [row] = await q.query(`UPDATE requests SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`, [request.id]);
      return row;
    });
    res.json({ request: requestSummary(updated, { withDetails: true }) });
  });

  // The assigned helper steps away. The request reopens so the seeker can
  // find someone else.
  router.post('/requests/:id/release', async (req, res) => {
    const request = await loadRequest(req.params.id);
    if (request.helper_id !== req.user.id) throw new HttpError(404, 'not_found');
    if (request.status !== 'matched') throw new HttpError(409, 'wrong_status');
    await db.tx(async (q) => {
      await q.query(
        `UPDATE threads SET status = 'withdrawn', updated_at = now() WHERE request_id = $1 AND helper_id = $2`,
        [request.id, req.user.id],
      );
      await q.query(`UPDATE requests SET status = 'open', helper_id = NULL, step = 0, updated_at = now() WHERE id = $1`, [request.id]);
    });
    res.json({ ok: true });
  });

  // Two-way reviews: each side rates the other once the work has ended.
  router.post('/requests/:id/reviews', async (req, res) => {
    const b = parse(z.object({ rating: z.number().int().min(1).max(5), comment: text(600).default('') }), req.body);
    const request = await loadRequest(req.params.id);
    const me = req.user.id;
    const isParticipant = request.helper_id && (request.seeker_id === me || request.helper_id === me);
    if (!isParticipant) throw new HttpError(404, 'not_found');
    if (!['completed', 'cancelled'].includes(request.status)) throw new HttpError(409, 'wrong_status');
    const reviewee = request.seeker_id === me ? request.helper_id : request.seeker_id;
    try {
      await db.query(
        'INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, $5)',
        [request.id, me, reviewee, b.rating, b.comment],
      );
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'already_reviewed');
      throw err;
    }
    res.status(201).json({ ok: true });
  });

  return router;
}
