// Shared vocabulary. The client reads these through GET /api/meta, so this file
// is the single source of truth for codes. Labels live in the client translations.

// ISO 3166-1 alpha-2 codes for Mexico, Central America, and South America.
export const COUNTRIES = [
  'AR', 'BO', 'BR', 'BZ', 'CL', 'CO', 'CR', 'EC', 'SV', 'GT',
  'GY', 'HN', 'MX', 'NI', 'PA', 'PY', 'PE', 'SR', 'UY', 'VE',
];

// Documents a helper can realistically request in person on someone's behalf.
// Passports and visas are left out on purpose: they normally require the
// applicant to appear in person, so a helper cannot obtain them.
export const DOC_TYPES = [
  'birth_certificate',
  'marriage_certificate',
  'death_certificate',
  'national_id_record',
  'police_record',
  'academic_record',
  'apostille',
  'property_record',
  'other',
];

export const URGENCIES = ['low', 'normal', 'high', 'emergency'];

export const LANGUAGES = ['es', 'pt', 'en', 'qu', 'gn', 'ay', 'quc', 'mam'];

export const LOCALES = ['es', 'en', 'pt'];

// Progress of a matched request. The helper advances steps 1 to 4, and the
// seeker confirms step 5, which completes the request.
export const STEPS = ['matched', 'details_confirmed', 'requested', 'obtained', 'sent', 'received'];

export const REPORT_REASONS = ['fraud', 'upfront_money', 'harassment', 'no_show', 'other'];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FILE_RETENTION_DAYS = 7;
export const MAX_OPEN_REQUESTS = 5;
