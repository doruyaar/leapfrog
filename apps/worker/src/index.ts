import { greet } from '@leapfrog/core';
import { runAskCommand } from './commands/ask.js';
import { runBriefCommand } from './commands/brief.js';
import { runEmbedCommand } from './commands/embed.js';
import { runEnrichCommand } from './commands/enrich.js';
import { runFetchCommand } from './commands/fetch-sources.js';
import { runIngestCommand } from './commands/ingest.js';
import { runSeedCommand } from './commands/seed.js';

const USAGE = `${greet()}

Usage: worker <command> [options]

Commands:
  seed      Load the committed demo snapshot (no API key needed). Safe to repeat.
  fetch     Run the source adapters against the catalog and print what they return.
  ingest    Fetch, normalize, dedupe, and persist into SQLite. Safe to repeat.
  enrich    Classify, score, and summarize stored raw items with the LLM. Safe to repeat.
  embed     Chunk and embed enriched items into the retrieval index. Safe to repeat.
  brief     Compose and store today's ranked, cited brief. Safe to repeat.
  ask       Answer a question with hybrid RAG and grounded citations.

Options (fetch, ingest):
  --kind <rss|github|nvd>   Only sources of this kind
  --match <text>            Only sources whose name or locator contains <text>
  --since-days <n>          Ignore items older than n days

Options (all commands):
  --max <n>                 Cap items (fetch: 10/source, ingest: 25/source, enrich/embed: all pending)
  --json                    Print machine-readable output

Options (seed):
  --skip-embed              Load data only; do not build the retrieval index

Options (brief):
  --date <YYYY-MM-DD>       Day the brief covers (default today)
  --top <n>                 Number of signals in the brief (default 8)
  --notify                  Push impact >= 4 signals to SLACK_WEBHOOK_URL if set

Options (ask):
  --q <text>                The question to answer (required)
  --vendor <name>           Restrict retrieval to one vendor
  --category <name>         Restrict retrieval to one category

Options for "seed", "ingest", "enrich", "embed", and "brief":
  --db <path>               SQLite file to use (default data/leapfrog.sqlite)

Environment:
  LEAPFROG_DB_PATH          Default SQLite file location
  GITHUB_TOKEN              Raises the GitHub API limit from 60 to 5,000 requests/hour
  NVD_API_KEY               Raises the NVD limit from 5 to 50 requests/30s
  OPENROUTER_API_KEY        Required for "enrich"; without it, use demo-mode seed data
  OPENROUTER_ENRICH_MODEL   Enrichment model slug (default openai/gpt-4o-mini)
  EMBEDDING_MODEL           Local embedding model (default Xenova/bge-small-en-v1.5)
`;

/**
 * Worker entrypoint. Scheduling (node-cron) lands in a later issue; today the worker
 * exposes each finished pipeline stage as a CLI command.
 */
async function main(argv: string[]): Promise<number> {
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
    case 'embed':
      return runEmbedCommand(rest);
    case 'brief':
      return runBriefCommand(rest);
    case 'ask':
      return runAskCommand(rest);
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
