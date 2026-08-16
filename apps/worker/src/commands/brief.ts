/**
 * `worker brief` — compose today's brief (docs/DESIGN.md §5, step 5): rank the corpus by
 * impact × recency, write a citation-safe executive summary, and persist one row for the
 * day. No API key required — the summary is composed extractively from the signals' own
 * grounded text. `--notify` additionally pushes high-impact signals to Slack when
 * `SLACK_WEBHOOK_URL` is set. Safe to re-run: recomposing a day upserts in place.
 */
import {
  composeBrief,
  createDatabase,
  notifyHighImpact,
  resolveDatabasePath,
  runMigrations,
  saveBrief,
  type StoredBrief,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface BriefCommandOptions {
  date?: string;
  topN?: number;
  dbPath?: string;
  notify: boolean;
  json: boolean;
}

export function parseBriefArgs(argv: string[]): BriefCommandOptions {
  const flags = parseFlags(argv, {
    values: ['date', 'top', 'db'],
    switches: ['json', 'notify'],
  });

  return {
    date: stringFlag(flags, 'date'),
    topN: numberFlag(flags, 'top', { min: 1 }),
    dbPath: stringFlag(flags, 'db'),
    notify: flags.notify === true,
    json: flags.json === true,
  };
}

function print(brief: StoredBrief): void {
  console.log(`\n${brief.briefDate} — ${brief.model ?? 'empty'}\n`);
  console.log(brief.summary);
  console.log('');
  for (const item of brief.items) {
    const vendor = item.vendor ? ` · ${item.vendor}` : '';
    console.log(
      `  [${item.impactScore}] #${item.id} ${item.category}${vendor} — ${item.title}`,
    );
  }
  console.log(`\n${brief.items.length} insight(s).`);
}

export async function runBriefCommand(argv: string[]): Promise<number> {
  const options = parseBriefArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  const verbose = !options.json;
  if (verbose) {
    console.log(`Composing brief in ${resolveDatabasePath(options.dbPath)}…\n`);
  }

  try {
    if (verbose) process.stdout.write('→ Ranking insights and composing summary … ');
    const composed = await composeBrief(db, { date: options.date, topN: options.topN });
    if (verbose) {
      console.log(
        `✓ ${composed.items.length} insight(s), summary via ${composed.model ?? 'empty'}`,
      );
    }

    if (verbose) process.stdout.write('→ Saving brief … ');
    const brief = saveBrief(db, composed);
    if (verbose) console.log(`✓ stored for ${brief.briefDate}`);

    let notified: Awaited<ReturnType<typeof notifyHighImpact>> | undefined;
    if (options.notify) {
      if (verbose) process.stdout.write('→ Notifying Slack … ');
      notified = await notifyHighImpact(brief.briefDate, brief.items);
      if (verbose) {
        console.log(
          notified.delivered
            ? `✓ alerted on ${notified.sent} insight(s)`
            : `• skipped (${notified.reason})`,
        );
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ brief, notified }, null, 2));
    } else {
      print(brief);
    }

    return 0;
  } finally {
    db.$client.close();
  }
}
