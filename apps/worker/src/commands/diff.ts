/**
 * `worker diff` — pipeline stage between enrich and brief (GAP-PLAN §3.2): classify
 * each enriched item against the recorded vendor state (new / update / rephrase /
 * duplicate) and maintain the `vendor_facts` chain.
 *
 * Idempotent by design: it diffs items that have no change event yet, so it is safe
 * to run after every enrich or on a schedule. Works with **zero keys** — revised
 * items get a deterministic textual diff and fresh items a local-embedding
 * similarity check; `OPENROUTER_API_KEY` upgrades fresh items to the `diff@1`
 * prompt, with the deterministic path as fallback.
 */
import {
  createDatabase,
  diffItems,
  resolveDatabasePath,
  runMigrations,
  type DiffItemOutcome,
  type DiffProgress,
  type DiffReport,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface DiffCommandOptions {
  maxItems?: number;
  rebuild: boolean;
  dbPath?: string;
  json: boolean;
}

export function parseDiffArgs(argv: string[]): DiffCommandOptions {
  const flags = parseFlags(argv, {
    values: ['max', 'db'],
    switches: ['json', 'rebuild'],
  });

  return {
    maxItems: numberFlag(flags, 'max', { min: 1 }),
    rebuild: flags.rebuild === true,
    dbPath: stringFlag(flags, 'db'),
    json: flags.json === true,
  };
}

const MAX_TITLE = 56;

function truncate(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

function tag(progress: DiffProgress): string {
  return `[${progress.index}/${progress.total}] #${progress.rawItemId}`;
}

function logItemComplete(
  progress: DiffProgress,
  outcome: DiffItemOutcome,
  elapsedMs: number,
): void {
  const secs = `${(elapsedMs / 1000).toFixed(1)}s`;
  if (outcome.status === 'ok') {
    const via = outcome.live ? 'diff@1' : 'deterministic';
    console.log(
      `✓ ${tag(progress)} ${outcome.kind} (${outcome.dimension}, materiality ${outcome.materiality}, ${via}) ${truncate(progress.title)} (${secs})`,
    );
  } else {
    console.error(`✗ ${tag(progress)} failed: ${outcome.error} (${secs})`);
  }
}

function printSummary(report: DiffReport): void {
  const { attempted, byKind, failed } = report;
  console.log(
    `\n${attempted} attempted — ${byKind.new} new, ${byKind.update} updates, ` +
      `${byKind.rephrase} re-phrasings, ${byKind.duplicate} duplicates, ${failed} failed`,
  );
}

export async function runDiffCommand(argv: string[]): Promise<number> {
  const options = parseDiffArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  if (!options.json) {
    const mode = options.rebuild ? 'Rebuilding change events' : 'Diffing pending items';
    console.log(`${mode} in ${resolveDatabasePath(options.dbPath)}…\n`);
  }

  try {
    const report = await diffItems(db, {
      maxItems: options.maxItems,
      rebuild: options.rebuild,
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
