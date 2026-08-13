/**
 * `worker ingest` — the pipeline through normalize/dedupe: fetch every selected
 * source and persist what is new into SQLite.
 *
 * Safe to run on a schedule or by hand as often as you like: sources upsert on their
 * locator and items on their canonical-URL hash, so a repeat run re-reads the feeds
 * and writes nothing. Migrations run first, so a fresh clone can ingest immediately.
 */
import {
  createDatabase,
  ingestSources,
  resolveDatabasePath,
  runMigrations,
  type IngestReport,
  type SourceIngestReport,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';
import { selectSources, type SourceFilter } from '../catalog.js';

export interface IngestOptions extends SourceFilter {
  maxItems: number;
  /** Ignore items older than this many days, overriding each source's fetch cursor. */
  sinceDays?: number;
  dbPath?: string;
  json: boolean;
}

export function parseIngestArgs(argv: string[]): IngestOptions {
  const flags = parseFlags(argv, {
    values: ['kind', 'match', 'max', 'since-days', 'db'],
    switches: ['json'],
  });

  return {
    kind: stringFlag(flags, 'kind'),
    match: stringFlag(flags, 'match'),
    maxItems: numberFlag(flags, 'max', { min: 1 }) ?? 25,
    sinceDays: numberFlag(flags, 'since-days', { min: 0 }),
    dbPath: stringFlag(flags, 'db'),
    json: flags.json === true,
  };
}

/** One line per source: what came back, and what it changed in the store. */
function describe(report: SourceIngestReport): string {
  const { inserted, revised, unchanged, duplicate } = report.stored;
  const parts = [`${report.fetched} fetched`];
  if (inserted) parts.push(`${inserted} new`);
  if (revised) parts.push(`${revised} revised`);
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (duplicate) parts.push(`${duplicate} duplicate`);
  return parts.join(', ');
}

function print(report: IngestReport): void {
  for (const source of report.sources) {
    if (source.status === 'failed') {
      console.error(`✗ ${source.source.name} — ${source.error?.message ?? 'failed'}`);
      continue;
    }

    console.log(`✓ ${source.source.name} — ${describe(source)}`);
    for (const warning of source.warnings) {
      console.warn(`    ! ${warning}`);
    }
  }

  const { sources, failed, fetched, inserted, revised, unchanged, duplicate } =
    report.totals;

  console.log(
    `\n${sources - failed}/${sources} sources ok — ${fetched} fetched, ` +
      `${inserted} new, ${revised} revised, ${unchanged} unchanged, ${duplicate} duplicate`,
  );
}

export async function runIngestCommand(argv: string[]): Promise<number> {
  const options = parseIngestArgs(argv);
  const sources = selectSources(options);

  if (sources.length === 0) {
    console.error('no catalog sources matched the given filters');
    return 1;
  }

  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  const since =
    options.sinceDays === undefined
      ? undefined
      : new Date(Date.now() - options.sinceDays * 86_400_000);

  if (!options.json) {
    console.log(
      `Ingesting ${sources.length} source(s) into ${resolveDatabasePath(options.dbPath)}…\n`,
    );
  }

  try {
    const report = await ingestSources(db, sources, {
      maxItems: options.maxItems,
      since,
    });

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            totals: report.totals,
            sources: report.sources.map((source) => ({
              name: source.source.name,
              status: source.status,
              fetched: source.fetched,
              stored: source.stored,
              warnings: source.warnings,
              error: source.error?.message,
            })),
          },
          null,
          2,
        ),
      );
    } else {
      print(report);
    }

    return report.totals.failed > 0 ? 1 : 0;
  } finally {
    db.$client.close();
  }
}
