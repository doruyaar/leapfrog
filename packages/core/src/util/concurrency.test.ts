import { describe, expect, it } from 'vitest';
import { mapGroupedByKey, mapWithConcurrency } from './concurrency.js';

/** A promise plus its resolver, so a test can release work in a controlled order. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const results = await mapWithConcurrency([10, 1, 5], 3, async (ms, index) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${index}:${ms}`;
    });
    expect(results).toEqual(['0:10', '1:1', '2:5']);
  });

  it('never runs more than `limit` workers at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
      },
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('treats a limit below 1 as sequential and handles an empty list', async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return n;
    });
    expect(peak).toBe(1);
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe('mapGroupedByKey', () => {
  it('serialises items sharing a key while overlapping distinct keys', async () => {
    // Two lanes: 'a' (two items) and 'b' (one). Gate every worker so we can prove that
    // the second 'a' item does not start until the first 'a' item has finished.
    const items = [
      { key: 'a', id: 'a1' },
      { key: 'b', id: 'b1' },
      { key: 'a', id: 'a2' },
    ];
    const gates = new Map(items.map((item) => [item.id, deferred<void>()]));
    const started: string[] = [];

    const run = mapGroupedByKey(
      items,
      8,
      (item) => item.key,
      async (item) => {
        started.push(item.id);
        await gates.get(item.id)!.promise;
        return item.id;
      },
    );

    // a1 and b1 (the heads of each lane) start immediately; a2 waits behind a1.
    await Promise.resolve();
    expect(started).toEqual(['a1', 'b1']);

    gates.get('a1')!.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toContain('a2');

    gates.get('a2')!.resolve();
    gates.get('b1')!.resolve();
    expect(await run).toEqual(['a1', 'b1', 'a2']);
  });

  it('bounds the number of lanes in flight to `limit`', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i); // 12 distinct keys
    await mapGroupedByKey(
      items,
      3,
      (n) => `k${n}`,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
      },
    );
    expect(peak).toBeLessThanOrEqual(3);
  });
});
