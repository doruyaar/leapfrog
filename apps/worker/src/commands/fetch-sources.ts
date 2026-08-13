/**
 * `worker fetch` — run the source adapters against the catalog and report what
 * came back. Nothing is written to the database: persistence arrives with the
 * normalize/dedupe stage. Until then this is how a source is smoke-tested before
 * it is added to the catalog, and how the demo-mode snapshot gets captured.
 */
import {
  DEFAULT_SOURCES,
  fetchSources,
  type SourceInput,
  type SourceRunOutcome,
} from '@leapfrog/core';

export interface FetchOptions {
  /** Only sources of this kind (`rss`, `github`, `nvd`). */
  kind?: string;
  /** Case-insensitive substring match on the source name or locator. */
  match?: string;
  maxItems: number;
  /** Ignore items older than this many days. */
  sinceDays?: number;
  /** Emit the fetched items as JSON instead of a human summary. */
  json: boolean;
}

export function parseFetchArgs(argv: string[]): FetchOptions {
  const options: FetchOptions = { maxItems: 10, json: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];

    switch (arg) {
      case '--kind':
        options.kind = value;
        i += 1;
        break;
      case '--match':
        options.match = value;
        i += 1;
        break;
      case '--max':
        options.maxItems = Number(value);
        i += 1;
        break;
      case '--since-days':
        options.sinceDays = Number(value);
        i += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.maxItems) || options.maxItems < 1) {
    throw new Error('--max must be a positive number');
  }
  if (options.sinceDays !== undefined && !Number.isFinite(options.sinceDays)) {
    throw new Error('--since-days must be a number');
  }

  return options;
}

export function selectSources(options: FetchOptions): SourceInput[] {
  const match = options.match?.toLowerCase();

  return DEFAULT_SOURCES.filter((source) => {
    if (options.kind && source.kind !== options.kind) return false;
    if (!match) return true;
    return `${source.name} ${source.url}`.toLowerCase().includes(match);
  });
}

function report(outcomes: SourceRunOutcome[]): void {
  let items = 0;
  let failures = 0;

  for (const outcome of outcomes) {
    if (outcome.status === 'failed') {
      failures += 1;
      console.error(`✗ ${outcome.source.name} — ${outcome.error.message}`);
      continue;
    }

    const { result } = outcome;
    items += result.items.length;
    console.log(`✓ ${outcome.source.name} — ${result.items.length} item(s)`);

    for (const item of result.items.slice(0, 3)) {
      const date = item.publishedAt?.toISOString().slice(0, 10) ?? 'undated';
      console.log(`    ${date}  ${item.title}`);
    }
    for (const warning of result.warnings) {
      console.warn(`    ! ${warning}`);
    }
  }

  console.log(
    `\n${outcomes.length - failures}/${outcomes.length} sources ok, ${items} item(s) fetched`,
  );
}

export async function runFetchCommand(argv: string[]): Promise<number> {
  const options = parseFetchArgs(argv);
  const sources = selectSources(options);

  if (sources.length === 0) {
    console.error('no catalog sources matched the given filters');
    return 1;
  }

  const since =
    options.sinceDays === undefined
      ? undefined
      : new Date(Date.now() - options.sinceDays * 86_400_000);

  if (!options.json) {
    console.log(`Fetching ${sources.length} source(s)…\n`);
  }

  const outcomes = await fetchSources(sources, { maxItems: options.maxItems, since });

  if (options.json) {
    const items = outcomes.flatMap((outcome) =>
      outcome.status === 'ok'
        ? outcome.result.items.map((item) => ({ source: outcome.source.name, ...item }))
        : [],
    );
    console.log(JSON.stringify(items, null, 2));
  } else {
    report(outcomes);
  }

  return outcomes.some((outcome) => outcome.status === 'failed') ? 1 : 0;
}
