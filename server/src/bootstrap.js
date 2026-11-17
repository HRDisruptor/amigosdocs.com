import { hashPassword, verifyPassword } from './auth.js';

// Makes the configured administrator account real. The environment is the
// source of truth: if someone registered that email first, they are locked
// out, because the password is reset and their sessions are removed.
export async function ensureAdmin(db, { adminEmail, adminPassword }) {
  if (!adminEmail || !adminPassword) return;
  if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  const [existing] = await db.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
  if (!existing) {
    await db.query(
      `INSERT INTO users (email, password_hash, name, is_admin) VALUES ($1, $2, 'Administrator', TRUE)`,
      [adminEmail, await hashPassword(adminPassword)],
    );
    return;
  }
  if (await verifyPassword(adminPassword, existing.password_hash)) {
    await db.query(`UPDATE users SET is_admin = TRUE, status = 'active' WHERE id = $1`, [existing.id]);
    return;
  }
  await db.query(`UPDATE users SET password_hash = $2, is_admin = TRUE, status = 'active' WHERE id = $1`, [
    existing.id,
    await hashPassword(adminPassword),
  ]);
  await db.query('DELETE FROM sessions WHERE user_id = $1', [existing.id]);
}

// One starter guide per interface language, so the Guides page is useful on
// day one. It is deliberately general. Country-specific steps should be added
// by an administrator with a link to the official source.
const STARTER_GUIDES = [
  {
    language: 'es',
    title: 'Antes de pedir un documento: qué tener a mano',
    body: [
      'Tu amigo podrá ayudarte más rápido si reúnes esta información antes de empezar:',
      '• El nombre completo de la persona tal como aparece en el registro, incluidos los dos apellidos.',
      '• La fecha y el lugar del hecho (nacimiento, matrimonio o defunción).',
      '• Los nombres completos de los padres, si el documento los incluye.',
      '• La oficina, notaría o registro donde se inscribió, si lo sabes.',
      '• Si necesitas apostilla o legalización para usar el documento en otro país.',
      '• Cómo quieres recibirlo: copia digital, mensajería internacional o entrega a un familiar.',
      'Pregunta en la oficina si tu amigo necesita una carta de autorización o un poder para pedir el documento en tu nombre. Los requisitos cambian según el país y la oficina.',
    ].join('\n'),
  },
  {
    language: 'en',
    title: 'Before you ask for a document: what to have ready',
    body: [
      'Your amigo can help you faster if you gather this information before you start:',
      '• The full name of the person exactly as it appears in the record, including both family names.',
      '• The date and place of the event (birth, marriage, or death).',
      '• The full names of the parents, if the document lists them.',
      '• The office, notary, or registry where it was recorded, if you know it.',
      '• Whether you need an apostille or legalization to use the document in another country.',
      '• How you want to receive it: a digital copy, international courier, or handed to a relative.',
      'Ask the office whether your amigo needs an authorization letter or a power of attorney to request the document on your behalf. Requirements differ by country and by office.',
    ].join('\n'),
  },
  {
    language: 'pt',
    title: 'Antes de pedir um documento: o que ter em mãos',
    body: [
      'Seu amigo poderá ajudar mais rápido se você reunir estas informações antes de começar:',
      '• O nome completo da pessoa exatamente como aparece no registro.',
      '• A data e o local do fato (nascimento, casamento ou óbito).',
      '• Os nomes completos dos pais, se constarem no documento.',
      '• O cartório ou órgão onde foi registrado, se você souber.',
      '• Se você precisa de apostila ou legalização para usar o documento em outro país.',
      '• Como você quer receber: cópia digital, remessa internacional ou entrega a um familiar.',
      'Pergunte no cartório se o seu amigo precisa de uma autorização ou procuração para pedir o documento em seu nome. Os requisitos variam conforme o país e o órgão.',
    ].join('\n'),
  },
];

export async function ensureStarterGuides(db) {
  const [{ count }] = await db.query('SELECT COUNT(*)::int AS count FROM guides');
  if (count > 0) return;
  for (const guide of STARTER_GUIDES) {
    await db.query('INSERT INTO guides (title, body, language) VALUES ($1, $2, $3)', [guide.title, guide.body, guide.language]);
  }
}

// Removes expired files and sessions. Called at start and then hourly.
export async function cleanUp(db) {
  await db.query('DELETE FROM files WHERE expires_at <= now()');
  await db.query('DELETE FROM sessions WHERE expires_at <= now()');
}
