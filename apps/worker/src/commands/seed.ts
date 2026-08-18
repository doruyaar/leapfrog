/**
 * `worker seed` — load the committed demo snapshot (docs/DESIGN.md §4, "Demo mode").
 *
 * This is the command that makes the product runnable with **no API keys**: it replays
 * the pre-ingested + pre-enriched items in `data/seed` through the real normalize path
 * and rebuilds the retrieval index on-device. Embedding runs locally, so the only cost
 * is the one-time model download (~30 MB) that `embed` also incurs. Safe to re-run.
 */
import {
  createDatabase,
  resolveDatabasePath,
  runMigrations,
  seedDatabase,
  type SeedReport,
} from '@leapfrog/core';
import { parseFlags, stringFlag } from '../args.js';

export interface SeedCommandOptions {
  dbPath?: string;
  embed: boolean;
  json: boolean;
}

export function parseSeedArgs(argv: string[]): SeedCommandOptions {
  const flags = parseFlags(argv, {
    values: ['db'],
    switches: ['json', 'skip-embed'],
  });

  return {
    dbPath: stringFlag(flags, 'db'),
    embed: flags['skip-embed'] !== true,
    json: flags.json === true,
  };
}

function print(report: SeedReport): void {
  console.log(
    `✓ ${report.sources} sources, ${report.rawInserted} new items ` +
      `(${report.rawUnchanged} unchanged), ${report.enriched} enrichments loaded`,
  );
  if (report.embed) {
    console.log(
      `✓ ${report.embed.embedded} items embedded (${report.embed.chunks} chunks)`,
    );
  } else {
    console.log('• embedding skipped (--skip-embed)');
  }
  if (report.diff) {
    const { byKind } = report.diff;
    console.log(
      `✓ ${report.diff.attempted} items diffed — ${byKind.new} new, ` +
        `${byKind.update} updates, ${byKind.rephrase} re-phrasings`,
    );
  }
  if (report.battlecards > 0) {
    console.log(`✓ ${report.battlecards} battlecards stored`);
  }
}

export async function runSeedCommand(argv: string[]): Promise<number> {
  const options = parseSeedArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  if (!options.json) {
    console.log(`Seeding demo snapshot into ${resolveDatabasePath(options.dbPath)}…`);
    if (options.embed) {
      console.log(
        '(embeddings use OpenRouter when a key is set; the key-free local fallback ' +
          'downloads its model on first run)\n',
      );
    }
  }

  try {
    const report = await seedDatabase(db, { embed: options.embed });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      print(report);
    }

    const failed = report.embed?.failed ?? 0;
    return failed > 0 ? 1 : 0;
  } finally {
    db.$client.close();
  }
}
