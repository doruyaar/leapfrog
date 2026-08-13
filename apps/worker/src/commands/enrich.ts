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
  type EnrichReport,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface EnrichOptions {
  maxItems?: number;
  dbPath?: string;
  json: boolean;
}

export function parseEnrichArgs(argv: string[]): EnrichOptions {
  const flags = parseFlags(argv, {
    values: ['max', 'db'],
    switches: ['json'],
  });

  return {
    maxItems: numberFlag(flags, 'max', { min: 1 }),
    dbPath: stringFlag(flags, 'db'),
    json: flags.json === true,
  };
}

function print(report: EnrichReport): void {
  for (const outcome of report.outcomes) {
    if (outcome.status === 'ok') {
      console.log(
        `✓ #${outcome.rawItemId} — ${outcome.category}, impact ${outcome.impactScore}`,
      );
    } else if (outcome.status === 'quarantined') {
      console.warn(`⚠ #${outcome.rawItemId} — quarantined: ${outcome.reason}`);
    } else {
      console.error(`✗ #${outcome.rawItemId} — failed: ${outcome.error}`);
    }
  }

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
    const report = await enrichItems(db, { maxItems: options.maxItems });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      print(report);
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
