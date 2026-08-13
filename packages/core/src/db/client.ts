import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import SqliteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as schema from './schema.js';

/** Default on-disk location for the single SQLite store, overridable via env. */
export const DEFAULT_DB_PATH = 'data/leapfrog.sqlite';

export interface CreateDatabaseOptions {
  /** File path, or `:memory:` for an ephemeral database (tests). */
  path?: string;
  /** Log every SQL statement (Drizzle logger). */
  verbose?: boolean;
  /** Open read-only (fails if the file does not exist). */
  readonly?: boolean;
}

export type Database = ReturnType<typeof createDatabase>;

/**
 * Open the LeapFrog SQLite database with the sqlite-vec extension loaded and the
 * pragmas the app relies on (WAL, enforced foreign keys). Returns the Drizzle
 * client with the raw better-sqlite3 handle attached as `.$client` for the
 * virtual-table SQL that Drizzle does not model.
 */
export function createDatabase(options: CreateDatabaseOptions = {}) {
  const path = options.path ?? process.env.LEAPFROG_DB_PATH ?? DEFAULT_DB_PATH;

  if (path !== ':memory:' && !options.readonly) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new SqliteDatabase(path, { readonly: options.readonly ?? false });

  // sqlite-vec must be loaded before any query touches `vec_chunks`.
  sqliteVec.load(sqlite);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return drizzle(sqlite, { schema, logger: options.verbose ?? false });
}
