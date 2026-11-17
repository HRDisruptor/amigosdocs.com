import { norm } from './util.js';

// Matching for the core AmigoDocs flow: a seeker abroad needs a document from
// an office in their home country, so the best helper is one who can walk
// into that office. Location therefore carries the most weight, followed by
// evidence that the helper can be trusted and has done this before.
//
// The weights are plain numbers on purpose. They are easy to explain to a
// user ("why was this person suggested?") and easy to tune after the pilot.
export const WEIGHTS = {
  sameCity: 40,
  sameRegion: 20,
  expertise: 20,
  verified: 15,
  language: 10,
  rating: 10, // scaled by average rating out of 5
  experience: 5, // scaled by completed requests, capped at 10
};

// A helper is eligible only if they could act on the request at all.
export function isEligible(request, helper, { requireVerified = true } = {}) {
  if (!helper.is_helper || helper.status !== 'active' || !helper.available) return false;
  if (helper.id === request.seeker_id) return false;
  if (helper.helper_country !== request.country) return false;
  if (requireVerified && helper.verification !== 'verified') return false;
  return true;
}

export function scoreHelper(request, helper) {
  let score = 0;
  const reasons = [];
  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (norm(helper.helper_city) && norm(helper.helper_city) === norm(request.city)) {
    add(WEIGHTS.sameCity, 'same_city');
  } else if (norm(request.region) && norm(helper.helper_region) === norm(request.region)) {
    add(WEIGHTS.sameRegion, 'same_region');
  }
  if (helper.expertise?.includes(request.doc_type)) add(WEIGHTS.expertise, 'expertise');
  if (helper.verification === 'verified') add(WEIGHTS.verified, 'verified');
  if (helper.languages?.includes(request.language)) add(WEIGHTS.language, 'language');
  if (helper.review_count > 0 && helper.rating != null) {
    score += (helper.rating / 5) * WEIGHTS.rating;
    if (helper.rating >= 4.5) reasons.push('top_rated');
  }
  const completed = Math.min(helper.completed_count || 0, 10);
  if (completed > 0) {
    score += (completed / 10) * WEIGHTS.experience;
    reasons.push('experienced');
  }
  return { score: Math.round(score * 10) / 10, reasons };
}

export function rankHelpers(request, helpers, { requireVerified = true, limit = 20 } = {}) {
  return helpers
    .filter((helper) => isEligible(request, helper, { requireVerified }))
    .map((helper) => ({ helper, ...scoreHelper(request, helper) }))
    .sort((a, b) => b.score - a.score || a.helper.id - b.helper.id)
    .slice(0, limit);
}
