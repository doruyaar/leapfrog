#!/usr/bin/env node
/**
 * INTERNAL maintenance script — not part of the user-facing product.
 *
 * Deletes the single SQLite store (and its WAL/SHM sidecars) so the next run of
 * the pipeline rebuilds the schema from scratch. Use this after a schema change
 * that renames columns (e.g. `signal_id` -> `insight_id`): wipe, then re-run the
 * pipeline (`npm run seed`, or the live `fetch -> ingest -> enrich -> embed ->
 * diff -> brief` chain when `INGEST_LIVE=1`).
 *
 * The immutable inputs on disk are left untouched: the seed snapshot
 * (`data/seed/`) and the curated comparison matrix (`data/matrix/`). Only the
 * derived, rebuildable database is removed.
 *
 * Usage:
 *   node scripts/reset-db.mjs            # dry run: print what would be deleted
 *   node scripts/reset-db.mjs --yes      # actually delete the database files
 *
 * Honors LEAPFROG_DB_PATH exactly like the app (relative paths resolve to the
 * repo root); defaults to data/leapfrog.sqlite.
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DB_PATH = 'data/leapfrog.sqlite';

function resolveDbPath() {
  const configured = process.env.LEAPFROG_DB_PATH?.trim() || DEFAULT_DB_PATH;
  if (configured === ':memory:') return null;
  return isAbsolute(configured) ? configured : resolve(REPO_ROOT, configured);
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const apply = process.argv.includes('--yes') || process.argv.includes('-y');
const dbPath = resolveDbPath();

if (!dbPath) {
  console.log('LEAPFROG_DB_PATH is :memory: — nothing on disk to reset.');
  process.exit(0);
}

// The database plus the WAL/SHM sidecars better-sqlite3 leaves behind.
const targets = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`];
const present = targets.filter((p) => existsSync(p));

if (present.length === 0) {
  console.log(`No database found at ${dbPath} — already clean.`);
  process.exit(0);
}

console.log(`Database store: ${dbPath}`);
for (const p of present) {
  const size = statSync(p).isFile() ? ` (${humanSize(statSync(p).size)})` : '';
  console.log(`  ${apply ? 'deleting' : 'would delete'}: ${p}${size}`);
}

if (!apply) {
  console.log('\nDry run — re-run with --yes to delete, then rebuild the pipeline.');
  process.exit(0);
}

for (const p of present) rmSync(p, { force: true });
console.log('\nDone. Re-run the pipeline to rebuild the schema and data from scratch.');
