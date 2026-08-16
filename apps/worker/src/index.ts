import { greet } from '@leapfrog/core';
import { loadEnv } from './env.js';
import { runAskCommand } from './commands/ask.js';
import { runBattlecardCommand } from './commands/battlecard.js';
import { runBriefCommand } from './commands/brief.js';
import { runDiffCommand } from './commands/diff.js';
import { runEmbedCommand } from './commands/embed.js';
import { runEnrichCommand } from './commands/enrich.js';
import { runEvalCommand } from './commands/eval.js';
import { runFetchCommand } from './commands/fetch-sources.js';
import { runIngestCommand } from './commands/ingest.js';
import { runNotifyCommand } from './commands/notify.js';
import { runSeedCommand } from './commands/seed.js';

const USAGE = `${greet()}

Usage: worker <command> [options]

Commands:
  seed      Load the committed demo snapshot (no API key needed). Safe to repeat.
  fetch     Run the source adapters against the catalog and print what they return.
  ingest    Fetch, normalize, dedupe, and persist into SQLite. Safe to repeat.
  enrich    Classify, score, and summarize stored raw items with the LLM. Safe to repeat.
  diff      Detect state changes: new vs. update vs. re-phrasing. No key needed. Safe to repeat.
  embed     Chunk and embed enriched items into the retrieval index. Safe to repeat.
  brief     Compose and store today's ranked, cited brief. Safe to repeat.
  notify    Email each subscription its new matching insights. No key needed (writes .eml
            to data/outbox); RESEND_API_KEY delivers to a real inbox. Safe to repeat.
  ask       Answer a question with hybrid RAG and grounded citations.
  battlecard Compose, store, and export a competitor battlecard as Markdown.
  eval      Score the golden datasets (change classification). No key needed.

Options (fetch, ingest):
  --kind <rss|github|nvd>   Only sources of this kind
  --match <text>            Only sources whose name or locator contains <text>
  --since-days <n>          Ignore items older than n days

Options (all commands):
  --max <n>                 Cap items (fetch: 10/source, ingest: 25/source, enrich/embed: all pending)
  --json                    Print machine-readable output

Options (enrich):
  --concurrency <n>         Max in-flight model requests (default 1; higher is faster but may hit rate limits)

Options (diff):
  --rebuild                 Drop all change events and vendor facts, then replay the corpus

Options (seed):
  --skip-embed              Load data only; do not build the retrieval index

Options (brief):
  --date <YYYY-MM-DD>       Day the brief covers (default today)
  --top <n>                 Number of insights in the brief (default 8)
  --verify-urls             Fetch each source link and mark it verified/unreachable/irrelevant
  --notify                  Push impact >= 4 insights to SLACK_WEBHOOK_URL if set

Options (notify):
  --test <id>               Send a one-off test email for subscription <id> (ignores the
                            delivery ledger; falls back to a sample when nothing matches)
  --base-url <url>          Origin for email deep links (default APP_BASE_URL or localhost)

Options (ask):
  --q <text>                The question to answer (required)
  --vendor <name>           Restrict retrieval to one vendor
  --category <name>         Restrict retrieval to one category

Options (battlecard):
  --vendor <name>           Competitor to compose the card against (required)
  --out <file.md>           Write Markdown to a file instead of stdout

Options for "seed", "ingest", "enrich", "diff", "embed", "brief", and "notify":
  --db <path>               SQLite file to use (default data/leapfrog.sqlite)

Environment:
  LEAPFROG_DB_PATH          Default SQLite file location
  GITHUB_TOKEN              Raises the GitHub API limit from 60 to 5,000 requests/hour
  NVD_API_KEY               Raises the NVD limit from 5 to 50 requests/30s
  RESEND_API_KEY            Deliver "notify" emails to a real inbox; unset = .eml outbox
  NOTIFY_EMAIL_FROM         From address for notifications (default onboarding@resend.dev)
  NOTIFY_OUTBOX_DIR         Where demo-mode .eml files are written (default data/outbox)
  APP_BASE_URL              Origin used for email deep links (default http://localhost:3000)
  OPENROUTER_API_KEY        Required for "enrich"; without it, use demo-mode seed data
  OPENROUTER_ENRICH_MODEL   Enrichment model slug (default openai/gpt-4o-mini)
  OPENROUTER_DIFF_MODEL     Diff model slug (defaults to the enrich model; optional — diff runs key-free)
  DIFF_SIMILARITY_THRESHOLD Similarity at which a new item counts as a re-phrasing (default 0.92)
  EMBEDDING_MODEL           Local embedding model (default Xenova/bge-small-en-v1.5)
`;

/**
 * Worker entrypoint. Scheduling (node-cron) lands in a later issue; today the worker
 * exposes each finished pipeline stage as a CLI command.
 */
async function main(argv: string[]): Promise<number> {
  loadEnv();
  const [command, ...rest] = argv;

  switch (command) {
    case 'seed':
      return runSeedCommand(rest);
    case 'fetch':
      return runFetchCommand(rest);
    case 'ingest':
      return runIngestCommand(rest);
    case 'enrich':
      return runEnrichCommand(rest);
    case 'diff':
      return runDiffCommand(rest);
    case 'embed':
      return runEmbedCommand(rest);
    case 'brief':
      return runBriefCommand(rest);
    case 'notify':
      return runNotifyCommand(rest);
    case 'ask':
      return runAskCommand(rest);
    case 'battlecard':
      return runBattlecardCommand(rest);
    case 'eval':
      return runEvalCommand(rest);
    case undefined:
    case 'help':
    case '--help':
      console.log(USAGE);
      return 0;
    default:
      console.error(`unknown command: ${command}\n`);
      console.error(USAGE);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(`[worker] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
