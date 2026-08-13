import { greet } from '@leapfrog/core';
import { runFetchCommand } from './commands/fetch-sources.js';

const USAGE = `${greet()}

Usage: worker <command> [options]

Commands:
  fetch    Run the source adapters against the catalog and print what they return.

Options for "fetch":
  --kind <rss|github|nvd>   Only sources of this kind
  --match <text>            Only sources whose name or locator contains <text>
  --max <n>                 Items per source (default 10)
  --since-days <n>          Ignore items older than n days
  --json                    Print fetched items as JSON

Environment:
  GITHUB_TOKEN   Raises the GitHub API limit from 60 to 5,000 requests/hour
  NVD_API_KEY    Raises the NVD limit from 5 to 50 requests/30s
`;

/**
 * Worker entrypoint. Scheduling (node-cron) and the persist/enrich stages land in
 * the later M2/M3 issues; today the worker exposes the adapters as a CLI.
 */
async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case 'fetch':
      return runFetchCommand(rest);
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
