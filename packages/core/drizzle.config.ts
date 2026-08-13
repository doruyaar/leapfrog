import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the core SQLite schema. Standard tables are generated
 * from `schema.ts`; virtual tables (FTS5, sqlite-vec) live in a hand-written
 * `--custom` migration in the same folder.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
