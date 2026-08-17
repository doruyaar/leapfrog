/**
 * `worker brief` — compose today's brief (docs/DESIGN.md §5, step 5): rank the corpus by
 * impact × recency, write a citation-safe executive summary, and persist one row for the
 * day. No API key required — the summary is composed extractively from the signals' own
 * grounded text, every claim quoted from its source, and conflicts read from the change
 * history.
 *
 * Opt-in extras:
 * - `INGEST_LIVE=1` + `OPENROUTER_API_KEY` lets a model write the summary; its output is
 *   validated (citations resolve, quotes are verbatim, conflicts cite ≥2 sources) and
 *   falls back to the extractive summary if it does not hold up.
 * - `--verify-urls` fetches each item's link and marks it verified / unreachable /
 *   irrelevant, so a citation is only committed once it resolves to a relevant page.
 * - `--notify` pushes high-impact signals to Slack when `SLACK_WEBHOOK_URL` is set.
 *
 * Safe to re-run: recomposing a day upserts in place.
 */
import {
  composeBrief,
  createDatabase,
  createHttpUrlVerifier,
  createOpenRouterBriefSummarizer,
  MissingApiKeyError,
  notifyHighImpact,
  readBriefModelConfig,
  resolveDatabasePath,
  runMigrations,
  saveBrief,
  type BriefSummarizer,
  type StoredBrief,
  type UrlVerifier,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface BriefCommandOptions {
  date?: string;
  topN?: number;
  dbPath?: string;
  notify: boolean;
  verifyUrls: boolean;
  json: boolean;
}

export function parseBriefArgs(argv: string[]): BriefCommandOptions {
  const flags = parseFlags(argv, {
    values: ['date', 'top', 'db'],
    switches: ['json', 'notify', 'verify-urls'],
  });

  return {
    date: stringFlag(flags, 'date'),
    topN: numberFlag(flags, 'top', { min: 1 }),
    dbPath: stringFlag(flags, 'db'),
    notify: flags.notify === true,
    verifyUrls: flags['verify-urls'] === true,
    json: flags.json === true,
  };
}

function print(brief: StoredBrief): void {
  console.log(`\n${brief.briefDate} — ${brief.model ?? 'empty'}\n`);
  console.log(brief.summary);
  console.log('');
  for (const item of brief.items) {
    const vendor = item.vendor ? ` · ${item.vendor}` : '';
    const flag =
      item.urlStatus && item.urlStatus !== 'verified' ? ` [url: ${item.urlStatus}]` : '';
    console.log(
      `  [${item.impactScore}] #${item.id} ${item.category}${vendor} — ${item.title}${flag}`,
    );
  }
  console.log(`\n${brief.items.length} insight(s).`);

  if (brief.conflicts.length > 0) {
    console.log(
      `\n⚠ ${brief.conflicts.length} unresolved conflict(s) — surfaced, not decided:`,
    );
    for (const conflict of brief.conflicts) {
      console.log(`  • ${conflict.topic}`);
      for (const side of conflict.sides) {
        console.log(`      #${side.sourceId}: ${side.text}`);
      }
    }
  }
}

/**
 * Build the live summary writer when `INGEST_LIVE=1` and a key is present; otherwise stay
 * in demo mode (deterministic extractive summary), reporting why rather than erroring.
 */
function buildSummarizer(verbose: boolean): BriefSummarizer | undefined {
  if (process.env.INGEST_LIVE !== '1') return undefined;
  try {
    const summarizer = createOpenRouterBriefSummarizer(readBriefModelConfig());
    if (verbose) console.log(`  live summary via ${summarizer.model}`);
    return summarizer;
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      if (verbose) console.log('  no OPENROUTER_API_KEY — composing extractively');
      return undefined;
    }
    throw error;
  }
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
    const summarizer = buildSummarizer(verbose);
    const verifier: UrlVerifier | undefined = options.verifyUrls
      ? createHttpUrlVerifier()
      : undefined;
    if (verbose && verifier)
      console.log('  verifying source links before committing them');

    if (verbose) process.stdout.write('→ Ranking insights and composing summary … ');
    const composed = await composeBrief(db, {
      date: options.date,
      topN: options.topN,
      summarizer,
      verifier,
    });
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
