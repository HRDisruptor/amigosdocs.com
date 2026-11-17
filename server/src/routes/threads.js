import express, { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth.js';
import { FILE_RETENTION_DAYS, MAX_FILE_BYTES, REPORT_REASONS } from '../constants.js';
import { decryptFile, encryptFile, sniffMime } from '../filecrypto.js';
import { isEligible } from '../matching.js';
import { HttpError, USER_STATS, parse, parseId, publicUser, requestSummary } from '../util.js';

const text = (max) => z.string().trim().max(max);

export function threadRoutes({ db, config }) {
  const router = Router();
  router.use(requireUser);
  const requireVerified = config.requireVerifiedHelpers;

  // Loads a thread with its request and confirms the caller belongs to it.
  async function loadThread(id, userId) {
    const [row] = await db.query(
      `SELECT t.*, row_to_json(r) AS request FROM threads t JOIN requests r ON r.id = t.request_id WHERE t.id = $1`,
      [parseId(id)],
    );
    if (!row) throw new HttpError(404, 'not_found');
    const role = row.request.seeker_id === userId ? 'seeker' : row.helper_id === userId ? 'helper' : null;
    if (!role) throw new HttpError(404, 'not_found');
    return { thread: row, request: row.request, role };
  }

  const loadUser = async (id) => (await db.query(`SELECT u.*, ${USER_STATS} FROM users u WHERE u.id = $1`, [id]))[0];

  // Start a conversation. The seeker invites a helper (helperId given), or an
  // eligible helper offers to help with an open request.
  router.post('/requests/:id/threads', async (req, res) => {
    const b = parse(z.object({ helperId: z.number().int().positive().optional(), message: text(2000).optional() }), req.body);
    const [request] = await db.query('SELECT * FROM requests WHERE id = $1', [parseId(req.params.id)]);
    if (!request) throw new HttpError(404, 'not_found');
    if (request.status !== 'open') throw new HttpError(409, 'wrong_status');

    const me = req.user;
    let helper;
    let initiatedBy;
    if (request.seeker_id === me.id) {
      if (!b.helperId) throw new HttpError(400, 'validation', ['helperId']);
      helper = await loadUser(b.helperId);
      initiatedBy = 'seeker';
    } else {
      helper = me;
      initiatedBy = 'helper';
    }
    if (!helper || !isEligible(request, helper, { requireVerified })) throw new HttpError(403, 'helper_not_eligible');

    const threadId = await db.tx(async (q) => {
      const [existing] = await q.query('SELECT id FROM threads WHERE request_id = $1 AND helper_id = $2', [request.id, helper.id]);
      if (existing) return existing.id;
      const readColumn = initiatedBy === 'seeker' ? 'seeker_read_at' : 'helper_read_at';
      const [created] = await q.query(
        `INSERT INTO threads (request_id, helper_id, initiated_by, ${readColumn}) VALUES ($1, $2, $3, now()) RETURNING id`,
        [request.id, helper.id, initiatedBy],
      );
      if (b.message) {
        await q.query('INSERT INTO messages (thread_id, sender_id, body) VALUES ($1, $2, $3)', [created.id, me.id, b.message]);
      }
      return created.id;
    });
    res.status(201).json({ threadId });
  });

  // Every conversation the member is part of, most recently active first.
  router.get('/threads', async (req, res) => {
    const me = req.user.id;
    const rows = await db.query(
      `SELECT t.*, row_to_json(r) AS request,
         (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
         (SELECT COUNT(*)::int FROM messages m WHERE m.thread_id = t.id AND m.sender_id <> $1
            AND m.created_at > COALESCE(CASE WHEN r.seeker_id = $1 THEN t.seeker_read_at ELSE t.helper_read_at END,
                                        'epoch'::timestamptz)) AS unread
       FROM threads t JOIN requests r ON r.id = t.request_id
       WHERE t.helper_id = $1 OR r.seeker_id = $1
       ORDER BY t.updated_at DESC LIMIT 200`,
      [me],
    );
    const otherIds = [...new Set(rows.map((t) => (t.request.seeker_id === me ? t.helper_id : t.request.seeker_id)))];
    const others = otherIds.length ? await db.query(`SELECT u.*, ${USER_STATS} FROM users u WHERE u.id = ANY($1::int[])`, [otherIds]) : [];
    const byId = new Map(others.map((u) => [u.id, u]));
    res.json({
      threads: rows.map((t) => {
        const role = t.request.seeker_id === me ? 'seeker' : 'helper';
        const other = byId.get(role === 'seeker' ? t.helper_id : t.request.seeker_id);
        return {
          id: t.id,
          status: t.status,
          initiatedBy: t.initiated_by,
          role,
          needsMyAnswer: t.status === 'pending' && t.initiated_by !== role,
          request: requestSummary(t.request),
          other: other ? publicUser(other) : null,
          lastMessage: t.last_body ? t.last_body.slice(0, 140) : '',
          unread: t.unread,
          updatedAt: t.updated_at,
        };
      }),
    });
  });

  router.get('/threads/:id', async (req, res) => {
    const me = req.user.id;
    const { thread, request, role } = await loadThread(req.params.id, me);
    const otherId = role === 'seeker' ? thread.helper_id : request.seeker_id;
    const [other, messages, files, reviews] = await Promise.all([
      loadUser(otherId),
      db.query(
        `SELECT * FROM (SELECT id, sender_id, body, created_at FROM messages WHERE thread_id = $1 ORDER BY id DESC LIMIT 300) m ORDER BY id`,
        [thread.id],
      ),
      db.query(
        `SELECT id, uploader_id, filename, mime, size, created_at, expires_at FROM files
         WHERE thread_id = $1 AND expires_at > now() ORDER BY id`,
        [thread.id],
      ),
      db.query('SELECT reviewer_id FROM reviews WHERE request_id = $1', [request.id]),
    ]);
    await db.query(`UPDATE threads SET ${role === 'seeker' ? 'seeker_read_at' : 'helper_read_at'} = now() WHERE id = $1`, [thread.id]);

    // This thread is "the active one" when its helper is the one assigned to the request.
    const assigned = thread.status === 'accepted' && request.helper_id === thread.helper_id;
    const ended = ['completed', 'cancelled'].includes(request.status);
    res.json({
      thread: {
        id: thread.id,
        status: thread.status,
        initiatedBy: thread.initiated_by,
        role,
        canAnswer: thread.status === 'pending' && thread.initiated_by !== role && request.status === 'open',
        canWrite: ['pending', 'accepted'].includes(thread.status) && !ended,
        canShareFiles: assigned && request.status === 'matched',
        canReview: assigned && ended && !reviews.some((r) => r.reviewer_id === me),
        assigned,
      },
      request: requestSummary(request, { withDetails: true }),
      other: other ? publicUser(other) : null,
      messages: messages.map((m) => ({ id: m.id, mine: m.sender_id === me, body: m.body, createdAt: m.created_at })),
      files: files.map((f) => ({
        id: f.id, mine: f.uploader_id === me, filename: f.filename, mime: f.mime, size: f.size, createdAt: f.created_at, expiresAt: f.expires_at,
      })),
    });
  });

  router.post('/threads/:id/messages', async (req, res) => {
    const { body } = parse(z.object({ body: text(2000).min(1) }), req.body);
    const { thread, request, role } = await loadThread(req.params.id, req.user.id);
    if (!['pending', 'accepted'].includes(thread.status) || ['completed', 'cancelled'].includes(request.status)) {
      throw new HttpError(409, 'thread_closed');
    }
    const [message] = await db.query(
      'INSERT INTO messages (thread_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at',
      [thread.id, req.user.id, body],
    );
    await db.query(
      `UPDATE threads SET updated_at = now(), ${role === 'seeker' ? 'seeker_read_at' : 'helper_read_at'} = now() WHERE id = $1`,
      [thread.id],
    );
    res.status(201).json({ message: { id: message.id, mine: true, body: message.body, createdAt: message.created_at } });
  });

  // The side that did not start the conversation accepts. Accepting assigns
  // the helper to the request and closes every other pending conversation.
  router.post('/threads/:id/accept', async (req, res) => {
    const { thread, role } = await loadThread(req.params.id, req.user.id);
    if (thread.status !== 'pending' || thread.initiated_by === role) throw new HttpError(409, 'wrong_status');
    await db.tx(async (q) => {
      const [request] = await q.query(
        `UPDATE requests SET status = 'matched', helper_id = $2, step = 0, updated_at = now()
         WHERE id = $1 AND status = 'open' RETURNING id`,
        [thread.request_id, thread.helper_id],
      );
      if (!request) throw new HttpError(409, 'wrong_status');
      await q.query(`UPDATE threads SET status = 'accepted', updated_at = now() WHERE id = $1`, [thread.id]);
      await q.query(
        `UPDATE threads SET status = 'closed', updated_at = now() WHERE request_id = $1 AND id <> $2 AND status = 'pending'`,
        [thread.request_id, thread.id],
      );
    });
    res.json({ ok: true });
  });

  router.post('/threads/:id/decline', async (req, res) => {
    const { thread } = await loadThread(req.params.id, req.user.id);
    if (thread.status !== 'pending') throw new HttpError(409, 'wrong_status');
    await db.query(`UPDATE threads SET status = 'declined', updated_at = now() WHERE id = $1`, [thread.id]);
    res.json({ ok: true });
  });

  // Files can be shared only after both sides have agreed to work together,
  // and each file is removed automatically after the retention period.
  router.post(
    '/threads/:id/files',
    express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES }),
    async (req, res) => {
      const { thread, request } = await loadThread(req.params.id, req.user.id);
      const assigned = thread.status === 'accepted' && request.helper_id === thread.helper_id && request.status === 'matched';
      if (!assigned) throw new HttpError(409, 'files_not_allowed');
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'file_missing');
      const mime = sniffMime(req.body);
      if (!mime) throw new HttpError(415, 'file_type');

      let filename = 'document';
      try {
        filename = decodeURIComponent(String(req.headers['x-filename'] || 'document'));
      } catch {
        // Keep the default name when the header is malformed.
      }
      filename = filename.replace(/[\\/\u0000-\u001f"<>|:*?]/g, '_').slice(0, 120) || 'document';

      const sealed = encryptFile(config.fileKey, req.body);
      const [file] = await db.query(
        `INSERT INTO files (thread_id, uploader_id, filename, mime, size, iv, tag, data, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '${FILE_RETENTION_DAYS} days')
         RETURNING id, filename, mime, size, created_at, expires_at`,
        [thread.id, req.user.id, filename, mime, req.body.length, sealed.iv, sealed.tag, sealed.data],
      );
      await db.query('UPDATE threads SET updated_at = now() WHERE id = $1', [thread.id]);
      res.status(201).json({
        file: { id: file.id, mine: true, filename: file.filename, mime: file.mime, size: file.size, createdAt: file.created_at, expiresAt: file.expires_at },
      });
    },
  );

  router.get('/files/:id', async (req, res) => {
    const [file] = await db.query('SELECT * FROM files WHERE id = $1 AND expires_at > now()', [parseId(req.params.id)]);
    if (!file) throw new HttpError(404, 'not_found');
    await loadThread(file.thread_id, req.user.id);
    const plain = decryptFile(config.fileKey, file);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(plain);
  });

  router.post('/reports', async (req, res) => {
    const b = parse(
      z.object({ threadId: z.number().int().positive(), reason: z.enum(REPORT_REASONS), details: text(1500).default('') }),
      req.body,
    );
    const { thread, request, role } = await loadThread(b.threadId, req.user.id);
    const reportedId = role === 'seeker' ? thread.helper_id : request.seeker_id;
    await db.query(
      'INSERT INTO reports (reporter_id, reported_id, thread_id, reason, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, reportedId, thread.id, b.reason, b.details],
    );
    res.status(201).json({ ok: true });
  });

  return router;
}
