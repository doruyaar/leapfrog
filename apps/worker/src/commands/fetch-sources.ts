/**
 * `worker fetch` — run the source adapters against the catalog and report what came
 * back, writing nothing. This is how a source is smoke-tested before it is added to
 * the catalog; `worker ingest` is the same fetch with persistence.
 */
import { fetchSources, type SourceInput, type SourceRunOutcome } from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';
import { selectSources, type SourceFilter } from '../catalog.js';

export interface FetchOptions extends SourceFilter {
  maxItems: number;
  /** Ignore items older than this many days. */
  sinceDays?: number;
  /** Max distinct hosts fetched in parallel. */
  concurrency?: number;
  /** Emit the fetched items as JSON instead of a human summary. */
  json: boolean;
}

export function parseFetchArgs(argv: string[]): FetchOptions {
  const flags = parseFlags(argv, {
    values: ['kind', 'match', 'max', 'since-days', 'concurrency'],
    switches: ['json'],
  });

  return {
    kind: stringFlag(flags, 'kind'),
    match: stringFlag(flags, 'match'),
    maxItems: numberFlag(flags, 'max', { min: 1 }) ?? 10,
    sinceDays: numberFlag(flags, 'since-days', { min: 0 }),
    concurrency: numberFlag(flags, 'concurrency', { min: 1 }),
    json: flags.json === true,
  };
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
  const sources: SourceInput[] = selectSources(options);

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

  const outcomes = await fetchSources(
    sources,
    { maxItems: options.maxItems, since },
    { concurrency: options.concurrency },
  );

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
