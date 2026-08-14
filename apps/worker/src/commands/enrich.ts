/**
 * `worker enrich` — pipeline stage 3: turn stored raw items into validated, scored
 * enrichments (docs/DESIGN.md §5).
 *
 * Idempotent by design: it enriches items that have no good enrichment yet (new items
 * and previously quarantined ones), so it is safe to run after every ingest or on a
 * schedule. Live mode only — it needs `OPENROUTER_API_KEY`; without it the command
 * exits with a pointer to demo mode rather than a stack trace.
 */
import {
  createDatabase,
  enrichItems,
  MissingApiKeyError,
  resolveDatabasePath,
  runMigrations,
  type EnrichItemOutcome,
  type EnrichProgress,
  type EnrichReport,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface EnrichOptions {
  maxItems?: number;
  concurrency?: number;
  dbPath?: string;
  json: boolean;
}

export function parseEnrichArgs(argv: string[]): EnrichOptions {
  const flags = parseFlags(argv, {
    values: ['max', 'concurrency', 'db'],
    switches: ['json'],
  });

  return {
    maxItems: numberFlag(flags, 'max', { min: 1 }),
    concurrency: numberFlag(flags, 'concurrency', { min: 1 }),
    dbPath: stringFlag(flags, 'db'),
    json: flags.json === true,
  };
}

const MAX_TITLE = 56;

function truncate(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

/** `[3/24] #115` — a stable tag so start/finish lines pair up even when interleaved. */
function tag(progress: EnrichProgress): string {
  return `[${progress.index}/${progress.total}] #${progress.rawItemId}`;
}

/** One line as the request goes out; with concurrency > 1 several may be in flight. */
function logItemStart(progress: EnrichProgress): void {
  console.log(`→ ${tag(progress)} ${truncate(progress.title)}`);
}

/** One line when the item is persisted, tagged so it matches its start line. */
function logItemComplete(
  progress: EnrichProgress,
  outcome: EnrichItemOutcome,
  elapsedMs: number,
): void {
  const secs = `${(elapsedMs / 1000).toFixed(1)}s`;
  if (outcome.status === 'ok') {
    console.log(`✓ ${tag(progress)} ${outcome.category}, impact ${outcome.impactScore} (${secs})`);
  } else if (outcome.status === 'quarantined') {
    console.warn(`⚠ ${tag(progress)} quarantined: ${outcome.reason} (${secs})`);
  } else {
    console.error(`✗ ${tag(progress)} failed: ${outcome.error} (${secs})`);
  }
}

function printSummary(report: EnrichReport): void {
  const { attempted, enriched, quarantined, failed } = report;
  console.log(
    `\n${attempted} attempted — ${enriched} enriched, ${quarantined} quarantined, ${failed} failed`,
  );
}

export async function runEnrichCommand(argv: string[]): Promise<number> {
  const options = parseEnrichArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  if (!options.json) {
    console.log(`Enriching pending items in ${resolveDatabasePath(options.dbPath)}…\n`);
  }

  try {
    const report = await enrichItems(db, {
      maxItems: options.maxItems,
      concurrency: options.concurrency,
      // Live progress on the terminal; skipped in JSON mode to keep stdout parseable.
      onItemStart: options.json ? undefined : logItemStart,
      onItemComplete: options.json
        ? undefined
        : ({ outcome, elapsedMs, ...progress }) =>
            logItemComplete(progress, outcome, elapsedMs),
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printSummary(report);
    }

    return report.failed > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  } finally {
    db.$client.close();
  }
}
