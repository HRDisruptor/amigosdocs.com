import { createApp } from './app.js';
import { cleanUp, ensureAdmin, ensureStarterGuides } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {
  // A .env file is optional. Real environment variables are used when it is absent.
}

const config = loadConfig();
const db = await createDb(config);
await ensureAdmin(db, config);
await ensureStarterGuides(db);
await cleanUp(db);
setInterval(() => cleanUp(db).catch(console.error), 60 * 60 * 1000).unref();

const server = createApp({ db, config }).listen(config.port, () => {
  const engine = config.databaseUrl ? 'Postgres' : `embedded database in ${config.dataDir}`;
  console.log(`AmigoDocs API listening on http://localhost:${config.port} (${engine})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
}
