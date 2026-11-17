import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { sameOriginOnly, sessionTools } from './auth.js';
import * as constants from './constants.js';
import { accountRoutes } from './routes/accounts.js';
import { adminRoutes, guideRoutes } from './routes/admin.js';
import { requestRoutes } from './routes/requests.js';
import { threadRoutes } from './routes/threads.js';
import { HttpError } from './util.js';

export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  // Hosting platforms put a proxy in front of the app. Trusting one hop lets
  // rate limiting see the visitor's address and not the proxy's.
  if (config.production) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': config.production ? [] : null,
        },
      },
    }),
  );

  const limiter = (windowMs, limit) =>
    config.rateLimit
      ? rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'rate_limited' } })
      : (_req, _res, next) => next();
  const authLimiter = limiter(15 * 60 * 1000, 30);

  const api = express.Router();
  api.use(limiter(60 * 1000, 300));
  api.use(sameOriginOnly);
  api.use(express.json({ limit: '100kb' }));
  const sessions = sessionTools(db, config);
  api.use(sessions.load);

  api.get('/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  });

  api.get('/meta', (_req, res) => {
    res.json({
      countries: constants.COUNTRIES,
      docTypes: constants.DOC_TYPES,
      urgencies: constants.URGENCIES,
      languages: constants.LANGUAGES,
      steps: constants.STEPS,
      reportReasons: constants.REPORT_REASONS,
      maxFileBytes: constants.MAX_FILE_BYTES,
      fileRetentionDays: constants.FILE_RETENTION_DAYS,
      requireVerifiedHelpers: config.requireVerifiedHelpers,
    });
  });

  const deps = { db, config, sessions, authLimiter };
  api.use(accountRoutes(deps));
  api.use(requestRoutes(deps));
  api.use(threadRoutes(deps));
  api.use(guideRoutes(deps));
  api.use('/admin', adminRoutes(deps));
  api.use((_req, _res) => {
    throw new HttpError(404, 'not_found');
  });

  // API responses hold personal data and must never be cached by a browser or proxy.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  }, api);

  // In production the same server also delivers the built web app.
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, ...(err.fields ? { fields: err.fields } : {}) });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'file_too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'validation' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
