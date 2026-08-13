import 'server-only';
import { existsSync } from 'node:fs';
import { createDatabase, resolveDatabasePath, type Database } from '@leapfrog/core';

/**
 * The web app is a read-only reader of the single SQLite store the worker builds.
 * It never writes: pages open the same file (resolved to the workspace root, so dev
 * server cwd does not matter) read-only, and the handle is cached across requests.
 *
 * Before `npm run seed` there is no database file at all. Rather than throw, `getDb`
 * returns `null` so every page can render a friendly "run the seed" empty state — the
 * demo never shows a stack trace.
 */
let cached: Database | null = null;

export function getDb(): Database | null {
  const path = resolveDatabasePath();
  if (path !== ':memory:' && !existsSync(path)) return null;

  if (!cached) {
    cached = createDatabase({ readonly: true });
  }
  return cached;
}
