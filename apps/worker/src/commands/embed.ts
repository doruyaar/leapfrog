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
  type EmbedItemOutcome,
  type EmbedProgress,
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

const MAX_TITLE = 56;

function truncate(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

/** `[3/24] #115` — a stable tag so start/finish lines pair up. */
function tag(progress: EmbedProgress): string {
  return `[${progress.index}/${progress.total}] #${progress.rawItemId}`;
}

/** One line as an item starts chunking + embedding. */
function logItemStart(progress: EmbedProgress): void {
  console.log(`→ ${tag(progress)} ${truncate(progress.title)}`);
}

/** One line when the item is indexed, tagged so it matches its start line. */
function logItemComplete(
  progress: EmbedProgress,
  outcome: EmbedItemOutcome,
  elapsedMs: number,
): void {
  const secs = `${(elapsedMs / 1000).toFixed(1)}s`;
  if (outcome.status === 'ok') {
    console.log(`✓ ${tag(progress)} ${outcome.chunks} chunk(s) indexed (${secs})`);
  } else if (outcome.status === 'skipped') {
    console.warn(`⚠ ${tag(progress)} skipped: ${outcome.reason} (${secs})`);
  } else {
    console.error(`✗ ${tag(progress)} failed: ${outcome.error} (${secs})`);
  }
}

function printSummary(report: EmbedReport): void {
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
    console.log(`Embedding pending items in ${resolveDatabasePath(options.dbPath)}…`);
    console.log('(first run downloads the local embedding model, ~30 MB)\n');
  }

  try {
    const report = await embedItems(db, {
      maxItems: options.maxItems,
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
  } finally {
    db.$client.close();
  }
}
