export * from './constants.js';
export * from './schema.js';
export {
  createDatabase,
  DEFAULT_DB_PATH,
  resolveDatabasePath,
  type CreateDatabaseOptions,
  type Database,
  type Executor,
  type Transaction,
} from './client.js';
export { MIGRATIONS_FOLDER, migrateDatabase, runMigrations } from './migrate.js';
export {
  searchChunkEmbeddings,
  upsertChunkEmbedding,
  type VectorNeighbour,
} from './vectors.js';
