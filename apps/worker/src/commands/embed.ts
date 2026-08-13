/**
 * `worker embed` — pipeline stage 4: chunk enriched items, embed them on-device, and
 * write the keyword + vector retrieval index (docs/DESIGN.md §4).
 *
 * Idempotent by design: it embeds items that are enriched `ok` but not yet chunked, so it
 * is safe to run after every enrich or on a schedule. No API key is required — embeddings
 * run locally via transformers.js — but the first run downloads the model (~30 MB) and
 * caches it, so an initial invocation can pause before the first item.
 */
import {
  createDatabase,
  embedItems,
  resolveDatabasePath,
  runMigrations,
  type EmbedReport,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface EmbedCommandOptions {
  maxItems?: number;
  dbPath?: string;
  json: boolean;
}

export function parseEmbedArgs(argv: string[]): EmbedCommandOptions {
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

function print(report: EmbedReport): void {
  for (const outcome of report.outcomes) {
    if (outcome.status === 'ok') {
      console.log(`✓ #${outcome.rawItemId} — ${outcome.chunks} chunk(s) indexed`);
    } else if (outcome.status === 'skipped') {
      console.warn(`⚠ #${outcome.rawItemId} — skipped: ${outcome.reason}`);
    } else {
      console.error(`✗ #${outcome.rawItemId} — failed: ${outcome.error}`);
    }
  }

  const { attempted, embedded, chunks, skipped, failed } = report;
  console.log(
    `\n${attempted} attempted — ${embedded} embedded (${chunks} chunks), ` +
      `${skipped} skipped, ${failed} failed`,
  );
}

export async function runEmbedCommand(argv: string[]): Promise<number> {
  const options = parseEmbedArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  if (!options.json) {
    console.log(`Embedding pending items in ${resolveDatabasePath(options.dbPath)}…\n`);
  }

  try {
    const report = await embedItems(db, { maxItems: options.maxItems });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      print(report);
    }

    return report.failed > 0 ? 1 : 0;
  } finally {
    db.$client.close();
  }
}
