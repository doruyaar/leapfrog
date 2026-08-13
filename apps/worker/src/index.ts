import { greet } from '@leapfrog/core';
import { runFetchCommand } from './commands/fetch-sources.js';
import { runIngestCommand } from './commands/ingest.js';

const USAGE = `${greet()}

Usage: worker <command> [options]

Commands:
  fetch     Run the source adapters against the catalog and print what they return.
  ingest    Fetch, normalize, dedupe, and persist into SQLite. Safe to repeat.

Options (both commands):
  --kind <rss|github|nvd>   Only sources of this kind
  --match <text>            Only sources whose name or locator contains <text>
  --max <n>                 Items per source (fetch: 10, ingest: 25)
  --since-days <n>          Ignore items older than n days
  --json                    Print machine-readable output

Options for "ingest":
  --db <path>               SQLite file to write (default data/leapfrog.sqlite)

Environment:
  LEAPFROG_DB_PATH   Default SQLite file location
  GITHUB_TOKEN       Raises the GitHub API limit from 60 to 5,000 requests/hour
  NVD_API_KEY        Raises the NVD limit from 5 to 50 requests/30s
`;

/**
 * Worker entrypoint. Scheduling (node-cron) and the enrich/embed stages land in the
 * later M2/M3 issues; today the worker exposes each finished stage as a CLI command.
 */
async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case 'fetch':
      return runFetchCommand(rest);
    case 'ingest':
      return runIngestCommand(rest);
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
