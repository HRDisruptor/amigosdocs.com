// Fills the local development database with fictional people so every screen
// has something to show. Run with: npm run seed
import { hashPassword } from './auth.js';
import { ensureStarterGuides } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';

const config = loadConfig();
if (config.production) {
  console.error('The seed script is for local development only.');
  process.exit(1);
}

const DEMO_PASSWORD = 'amigodocs-demo';

const db = await createDb(config);
const hash = await hashPassword(DEMO_PASSWORD);

async function user(email, name, extra = {}) {
  const u = {
    locale: 'es', is_helper: false, is_admin: false, residence_country: '', residence_city: '', languages: ['es'], bio: '',
    helper_country: null, helper_region: '', helper_city: '', expertise: [], verification: 'none', verification_note: '', ...extra,
  };
  const [row] = await db.query(
    `INSERT INTO users (email, password_hash, name, locale, is_helper, is_admin, residence_country, residence_city, languages,
       bio, helper_country, helper_region, helper_city, expertise, verification, verification_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14::text[], $15, $16)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [email, hash, name, u.locale, u.is_helper, u.is_admin, u.residence_country, u.residence_city, u.languages, u.bio,
      u.helper_country, u.helper_region, u.helper_city, u.expertise, u.verification, u.verification_note],
  );
  return row.id;
}

await user('admin@example.com', 'Admin Demo', { is_admin: true, locale: 'en' });
const lucia = await user('lucia@example.com', 'Lucía Ramírez Ortiz', {
  residence_country: 'United States', residence_city: 'Newark, NJ', languages: ['es', 'en'],
});
const ana = await user('ana@example.com', 'Ana María Gómez', {
  is_helper: true, helper_country: 'CO', helper_region: 'Cundinamarca', helper_city: 'Bogotá', languages: ['es', 'en'],
  expertise: ['birth_certificate', 'marriage_certificate', 'apostille'], verification: 'verified',
  bio: 'Vivo cerca de la Registraduría y he ayudado a familiares en el exterior con registros civiles y apostillas.',
});
await user('carlos@example.com', 'Carlos Peña Ruiz', {
  is_helper: true, helper_country: 'CO', helper_region: 'Antioquia', helper_city: 'Medellín', languages: ['es'],
  expertise: ['birth_certificate', 'police_record'], verification: 'verified',
  bio: 'Estudiante de derecho. Disponible por las mañanas para trámites en notarías y registro.',
});
await user('sofia@example.com', 'Sofía Herrera Díaz', {
  is_helper: true, helper_country: 'CO', helper_region: 'Cundinamarca', helper_city: 'Bogotá', languages: ['es'],
  expertise: ['academic_record'], verification: 'pending',
  verification_note: 'Soy voluntaria en una parroquia de Bogotá. Puedo hacer una videollamada para confirmar mi identidad.',
});
await user('miguel@example.com', 'Miguel Ángel Tzoc', {
  is_helper: true, helper_country: 'GT', helper_region: 'Quetzaltenango', helper_city: 'Quetzaltenango', languages: ['es', 'quc'],
  expertise: ['birth_certificate', 'national_id_record'], verification: 'verified',
  bio: 'Acompaño trámites en el registro civil. Hablo español y k’iche’.',
});

const [{ count }] = await db.query('SELECT COUNT(*)::int AS count FROM requests');
if (count === 0) {
  // A finished request, so Ana starts with a visible reputation.
  const [done] = await db.query(
    `INSERT INTO requests (seeker_id, doc_type, country, region, city, urgency, status, helper_id, step, completed_at)
     VALUES ($1, 'marriage_certificate', 'CO', 'Cundinamarca', 'Bogotá', 'normal', 'completed', $2, 5, now()) RETURNING id`,
    [lucia, ana],
  );
  await db.query(`INSERT INTO threads (request_id, helper_id, initiated_by, status) VALUES ($1, $2, 'seeker', 'accepted')`, [done.id, ana]);
  await db.query(
    `INSERT INTO reviews (request_id, reviewer_id, reviewee_id, rating, comment)
     VALUES ($1, $2, $3, 5, 'Ana fue clara y puntual. Recibí la copia en una semana.')`,
    [done.id, lucia, ana],
  );
  // An open request, ready to be matched.
  await db.query(
    `INSERT INTO requests (seeker_id, doc_type, country, region, city, details, urgency, language, thanks)
     VALUES ($1, 'birth_certificate', 'CO', 'Cundinamarca', 'Bogotá',
       'Necesito una copia reciente de mi registro civil de nacimiento para un trámite migratorio.', 'high', 'es',
       'Puedo cubrir los gastos del trámite y del envío.')`,
    [lucia],
  );
}
await ensureStarterGuides(db);
await db.close();

console.log(`Demo data is ready. Every demo account uses the password "${DEMO_PASSWORD}".`);
console.log('Accounts: admin@example.com, lucia@example.com (seeker), ana@example.com, carlos@example.com, miguel@example.com (helpers), sofia@example.com (awaiting verification).');
