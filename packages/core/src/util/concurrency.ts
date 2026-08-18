/**
 * Bounded concurrency primitives shared across the pipeline stages.
 *
 * Every stage that fans out (enrich, embed, the source stages) wants the same shape:
 * run up to N units of work at once, keep the results in input order, and never let a
 * higher limit than there is work spin idle workers. Centralising it here keeps the
 * "how many in flight" logic identical everywhere and independently testable.
 *
 * All of this is *in-process* async concurrency, not threads: the only real parallelism
 * is overlapping I/O waits (network completions). CPU work and better-sqlite3's
 * synchronous writes still run one-at-a-time on the event loop, which is exactly why the
 * concurrent DB writes downstream never interleave a transaction.
 */

/**
 * Map over `items` with at most `limit` invocations of `worker` in flight at once.
 * Results are returned in input order regardless of completion order. A `limit` below 1
 * is treated as 1 (fully sequential); a limit above `items.length` spins no idle workers.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const total = items.length;
  const results = new Array<R>(total);
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, total || 1));

  // A shared cursor: each worker claims the next index until the list is drained.
  let cursor = 0;
  async function run(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workers }, run));
  return results;
}

/**
 * Like {@link mapWithConcurrency}, but items sharing a `keyOf` value are processed
 * strictly in order within their group ("lane"), while up to `limit` *distinct* lanes
 * run in parallel. This is the safe way to parallelise host-bound work: requests to the
 * same host stay serialised (respecting its rate limit) while different hosts overlap.
 *
 * Results keep input order; lanes are scheduled in first-seen key order for determinism.
 */
export async function mapGroupedByKey<T, R>(
  items: readonly T[],
  limit: number,
  keyOf: (item: T, index: number) => string,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);

  const lanes = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = keyOf(item, index);
    const lane = lanes.get(key);
    if (lane) lane.push(index);
    else lanes.set(key, [index]);
  });

  await mapWithConcurrency([...lanes.values()], limit, async (lane) => {
    for (const index of lane) {
      results[index] = await worker(items[index]!, index);
    }
  });

  return results;
}
