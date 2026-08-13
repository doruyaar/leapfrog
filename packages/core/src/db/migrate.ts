import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDatabase, type Database } from './client.js';

/**
 * Absolute path to the generated + custom migration folder (`packages/core/drizzle`).
 * Built as `dirname(...) + ../../drizzle` rather than `new URL('../../drizzle', ...)` so
 * bundlers (Turbopack/webpack, when the web app pulls in core) do not try to resolve the
 * folder as a module — it is a runtime asset path, read only by the worker's migrator.
 */
export const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'drizzle',
);

/**
 * Apply all pending migrations (standard tables plus the FTS5 / sqlite-vec
 * virtual tables) to the given database. Idempotent: Drizzle tracks applied
 * migrations, so re-running is a no-op.
 */
export function runMigrations(db: Database): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * Open the configured database, migrate it, and return the client. Convenience
 * for app entrypoints that just need a ready-to-use, up-to-date database.
 */
export function migrateDatabase(...args: Parameters<typeof createDatabase>): Database {
  const db = createDatabase(...args);
  runMigrations(db);
  return db;
}

// `npm run db:migrate` — migrate the on-disk database, then close.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = migrateDatabase();
  db.$client.close();
  console.log('[db] migrations applied.');
}
