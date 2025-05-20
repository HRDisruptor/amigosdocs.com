// Pairing algorithm for matching requests to helpers

const User = require('../models/User');

async function pairRequestWithHelpers(request) {
  // Fetch helpers
  const helpers = await User.find({ role: 'helper', 'verifications.status': 'verified' });

  // Score helpers
  const scored = helpers.map(helper => {
    let score = 0;
    // Proximity (same city/country)
    if (helper.city === request.city && helper.country === request.country) score += 50;
    else if (helper.country === request.country) score += 20;
    // Language
    if (helper.languages.includes(request.preferredLanguage)) score += 20;
    // Document expertise
    if (helper.expertise.includes(request.documentType)) score += 30;
    // Consulate access
    if (helper.consulates.some(c => c.city === request.preferredConsulate.city && c.country === request.preferredConsulate.country)) score += 15;
    // Availability (simple check, can be expanded)
    score += 5 * helper.availability.length;
    // Rating
    score += helper.rating * 5;
    return { helper, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return best matches
  return scored.slice(0, 10).map(s => s.helper);
}

module.exports = { pairRequestWithHelpers };