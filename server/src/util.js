import { z } from 'zod';

// An error the client is meant to see. `code` is a stable identifier that the
// client translates into the reader's language.
export class HttpError extends Error {
  constructor(status, code, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean))];
  throw new HttpError(400, 'validation', fields);
}

export const idParam = z.coerce.number().int().positive();

export function parseId(value) {
  const result = idParam.safeParse(value);
  if (!result.success) throw new HttpError(404, 'not_found');
  return result.data;
}

// Compare place names without regard to accents, case, or stray spaces, so
// that "Bogotá", "bogota", and " BOGOTA " are the same city.
export function norm(text) {
  return (text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Privacy by default: other members see a first name and a last initial only.
export function displayName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts.slice(0, -1).join(' ')} ${parts.at(-1)[0].toUpperCase()}.`;
}

// SQL fragment that adds reputation columns to a `users u` query.
export const USER_STATS = `
  (SELECT AVG(rating)::float8 FROM reviews WHERE reviewee_id = u.id) AS rating,
  (SELECT COUNT(*)::int FROM reviews WHERE reviewee_id = u.id) AS review_count,
  (SELECT COUNT(*)::int FROM requests WHERE helper_id = u.id AND status = 'completed') AS completed_count`;

// What any signed-in member may see about another member.
export function publicUser(u) {
  return {
    id: u.id,
    name: displayName(u.name),
    isHelper: u.is_helper,
    verified: u.verification === 'verified',
    helperCountry: u.is_helper ? u.helper_country : null,
    helperRegion: u.is_helper ? u.helper_region : '',
    helperCity: u.is_helper ? u.helper_city : '',
    expertise: u.is_helper ? u.expertise : [],
    languages: u.languages,
    bio: u.bio,
    rating: u.rating == null ? null : Math.round(u.rating * 10) / 10,
    reviewCount: u.review_count ?? 0,
    completedCount: u.completed_count ?? 0,
    memberSince: u.created_at,
  };
}

// What a member sees about their own account. Secrets never leave the server.
export function privateUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    locale: u.locale,
    isHelper: u.is_helper,
    isAdmin: u.is_admin,
    residenceCountry: u.residence_country,
    residenceCity: u.residence_city,
    languages: u.languages,
    bio: u.bio,
    helperCountry: u.helper_country,
    helperRegion: u.helper_region,
    helperCity: u.helper_city,
    expertise: u.expertise,
    available: u.available,
    verification: u.verification,
    verificationNote: u.verification_note,
    totpEnabled: u.totp_enabled,
  };
}

export function requestSummary(r, { withDetails = false } = {}) {
  return {
    id: r.id,
    docType: r.doc_type,
    country: r.country,
    region: r.region,
    city: r.city,
    urgency: r.urgency,
    language: r.language,
    thanks: r.thanks,
    status: r.status,
    step: r.step,
    seekerId: r.seeker_id,
    helperId: r.helper_id,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    ...(withDetails ? { details: r.details } : {}),
  };
}
