import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './util.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const COOKIE = 'amigodocs_session';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = (stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  // A stored value of the wrong length is corrupt and must never verify.
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// The browser holds a random token. The database holds only its hash, so a
// leaked database does not hand out working sessions.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

export function sessionTools(db, config) {
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${config.production ? '; Secure' : ''}`;

  async function start(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
      [hashToken(token), userId],
    );
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; ${cookieFlags}`);
  }

  async function end(req, res) {
    const token = readCookie(req);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieFlags}`);
  }

  // Attaches req.user when the request carries a valid session.
  async function load(req, _res, next) {
    const token = readCookie(req);
    if (token) {
      const [user] = await db.query(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [hashToken(token)],
      );
      if (user && user.status === 'active') req.user = user;
    }
    next();
  }

  return { start, end, load };
}

export function requireUser(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'not_signed_in');
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'not_signed_in');
  if (!req.user.is_admin) throw new HttpError(403, 'forbidden');
  next();
}

// Cross-site request forgery guard. The session cookie is SameSite=Lax, and
// on top of that any state-changing request must come from this same site.
export function sameOriginOnly(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host !== req.headers.host) throw new HttpError(403, 'forbidden');
  }
  next();
}
