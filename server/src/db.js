import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');

// One small interface over two engines: real Postgres in production (through
// DATABASE_URL) and PGlite, an embedded Postgres, for development and tests.
// Both speak the same SQL, so there is no dialect drift between environments.
//
//   db.query(sql, params) -> array of rows
//   db.tx(async (q) => { await q.query(...) }) -> runs inside a transaction
export async function createDb({ databaseUrl, dataDir, memory = false }) {
  const db = databaseUrl ? await connectPostgres(databaseUrl) : await openEmbedded(memory ? null : dataDir);
  await db.exec(SCHEMA);
  return db;
}

async function connectPostgres(url) {
  const { default: pg } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  const wrap = (runner) => ({ query: async (sql, params = []) => (await runner.query(sql, params)).rows });
  return {
    ...wrap(pool),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openEmbedded(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const lite = new PGlite(dataDir ? path.join(dataDir, 'pgdata') : undefined);
  await lite.waitReady;
  const wrap = (runner) => ({ query: async (sql, params = []) => (await runner.query(sql, params)).rows });
  return {
    ...wrap(lite),
    exec: (sql) => lite.exec(sql),
    tx: (fn) => lite.transaction((t) => fn(wrap(t))),
    close: () => lite.close(),
  };
}
