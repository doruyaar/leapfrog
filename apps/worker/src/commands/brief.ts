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
  console.log(`\n${brief.items.length} signal(s).`);
}

export async function runBriefCommand(argv: string[]): Promise<number> {
  const options = parseBriefArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  if (!options.json) {
    console.log(`Composing brief in ${resolveDatabasePath(options.dbPath)}…`);
  }

  try {
    const composed = await composeBrief(db, { date: options.date, topN: options.topN });
    const brief = saveBrief(db, composed);

    let notified: Awaited<ReturnType<typeof notifyHighImpact>> | undefined;
    if (options.notify) {
      notified = await notifyHighImpact(brief.briefDate, brief.items);
    }

    if (options.json) {
      console.log(JSON.stringify({ brief, notified }, null, 2));
    } else {
      print(brief);
      if (notified) {
        console.log(
          notified.delivered
            ? `\n✓ Slack: alerted on ${notified.sent} high-impact signal(s).`
            : `\n• Slack: not sent (${notified.reason}).`,
        );
      }
    }

    return 0;
  } finally {
    db.$client.close();
  }
}
