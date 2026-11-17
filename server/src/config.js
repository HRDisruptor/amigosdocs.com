import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const config = {
    production,
    port: Number(env.PORT) || 3000,
    databaseUrl: env.DATABASE_URL || null,
    dataDir: path.resolve(REPO_ROOT, env.DATA_DIR || 'data'),
    clientDist: path.resolve(REPO_ROOT, 'client/dist'),
    adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase() || null,
    adminPassword: env.ADMIN_PASSWORD || null,
    requireVerifiedHelpers: env.REQUIRE_VERIFIED_HELPERS !== 'false',
    rateLimit: true,
    fileKey: null,
  };

  if (production && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production. The embedded database is for development only.');
  }

  if (env.FILE_ENCRYPTION_KEY) {
    if (!/^[0-9a-fA-F]{64}$/.test(env.FILE_ENCRYPTION_KEY)) {
      throw new Error('FILE_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes).');
    }
    config.fileKey = Buffer.from(env.FILE_ENCRYPTION_KEY, 'hex');
  } else if (production) {
    throw new Error('FILE_ENCRYPTION_KEY is required in production.');
  } else {
    config.fileKey = devFileKey(config.dataDir);
  }
  return config;
}

// In development a key is generated once and kept next to the local database,
// so files uploaded yesterday can still be opened today.
function devFileKey(dataDir) {
  const keyPath = path.join(dataDir, '.file-key');
  if (fs.existsSync(keyPath)) return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  return key;
}
