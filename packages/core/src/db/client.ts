import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import SqliteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as schema from './schema.js';

/**
 * Default on-disk location for the single SQLite store, overridable via env.
 * Relative to the workspace root — not the process's working directory, so the
 * worker and the web app open the same file whichever workspace they are started from.
 */
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

/** A transaction handle, as handed to the `db.transaction()` callback. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Whatever a query can run on: the database itself or an open transaction. */
export type Executor = Database | Transaction;

/** The workspace root: the nearest ancestor whose package.json declares workspaces. */
function workspaceRoot(from: string): string | undefined {
  let dir = from;

  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ('workspaces' in JSON.parse(readFileSync(manifest, 'utf8'))) return dir;
      } catch {
        // A malformed manifest is not our problem to report; keep walking up.
      }
    }

    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Where a given path setting actually points. Absolute paths and `:memory:` are taken
 * as given; a relative path is anchored to the workspace root so every process in the
 * monorepo agrees on one database file.
 */
export function resolveDatabasePath(path?: string): string {
  // Treat an empty/whitespace `LEAPFROG_DB_PATH` (common in a copied `.env`) as unset,
  // so it falls through to the default rather than resolving to the workspace root.
  const fromEnv = process.env.LEAPFROG_DB_PATH?.trim() || undefined;
  const configured = path ?? fromEnv ?? DEFAULT_DB_PATH;
  if (configured === ':memory:' || isAbsolute(configured)) return configured;

  return resolve(workspaceRoot(process.cwd()) ?? process.cwd(), configured);
}

/**
 * Open the LeapFrog SQLite database with the sqlite-vec extension loaded and the
 * pragmas the app relies on (WAL, enforced foreign keys). Returns the Drizzle
 * client with the raw better-sqlite3 handle attached as `.$client` for the
 * virtual-table SQL that Drizzle does not model.
 */
export function createDatabase(options: CreateDatabaseOptions = {}) {
  const path = resolveDatabasePath(options.path);

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
