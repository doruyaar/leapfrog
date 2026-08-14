/**
 * `worker battlecard` — compose a "us vs. one competitor" battlecard from the curated
 * comparison matrix and the live corpus, and export it as Markdown (docs/DESIGN.md §5).
 * No API key needed: the positioning line is composed extractively from tracked signals.
 * `--out <file.md>` writes the card to disk (for a CRM or deck); otherwise it prints.
 */
import { writeFileSync } from 'node:fs';
import {
  composeBattlecard,
  createDatabase,
  runMigrations,
  saveBattlecard,
  toMarkdown,
} from '@leapfrog/core';
import { parseFlags, stringFlag } from '../args.js';

export interface BattlecardCommandOptions {
  vendor: string;
  dbPath?: string;
  out?: string;
  json: boolean;
}

export function parseBattlecardArgs(argv: string[]): BattlecardCommandOptions {
  const flags = parseFlags(argv, {
    values: ['vendor', 'db', 'out'],
    switches: ['json'],
  });

  const vendor = stringFlag(flags, 'vendor');
  if (!vendor) throw new Error('battlecard needs a competitor: --vendor "Sonatype"');

  return {
    vendor,
    dbPath: stringFlag(flags, 'db'),
    out: stringFlag(flags, 'out'),
    json: flags.json === true,
  };
}

export async function runBattlecardCommand(argv: string[]): Promise<number> {
  const options = parseBattlecardArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  try {
    const card = await composeBattlecard(db, options.vendor);
    if (!card) {
      console.error(
        `no battlecard for "${options.vendor}" — it is not a competitor column in the matrix.`,
      );
      return 1;
    }

    // Persist the refreshed card so the web app serves it with a real
    // generatedAt — this is what the staleness check compares against.
    saveBattlecard(db, card);

    if (options.json) {
      console.log(JSON.stringify(card, null, 2));
      return 0;
    }

    const markdown = toMarkdown(card);
    if (options.out) {
      writeFileSync(options.out, `${markdown}\n`, 'utf8');
      console.log(`Wrote ${options.out} (${card.focusVendor} vs. ${card.vendor}).`);
    } else {
      console.log(markdown);
    }
    return 0;
  } finally {
    db.$client.close();
  }
}
