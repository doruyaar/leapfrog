import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOURCES } from './catalog.js';
import {
  fetchSources,
  getAdapter,
  listAdapters,
  UnsupportedSourceKindError,
} from './registry.js';
import type { SourceInput } from './types.js';

const FEED = `<rss version="2.0"><channel><item>
  <title>Release notes</title><link>https://example.test/a</link>
  <pubDate>Wed, 12 Aug 2026 09:30:00 +0000</pubDate>
</item></channel></rss>`;

describe('adapter registry', () => {
  it('resolves the shipped adapters', () => {
    expect(getAdapter('rss').kind).toBe('rss');
    expect(getAdapter('github').kind).toBe('github');
    expect(getAdapter('nvd').kind).toBe('nvd');
    expect(listAdapters()).toHaveLength(3);
  });

  it('reports kinds that have no adapter yet', () => {
    expect(() => getAdapter('hn')).toThrow(UnsupportedSourceKindError);
  });

  it('every catalog source has an adapter and a locator', () => {
    for (const source of DEFAULT_SOURCES) {
      expect(() => getAdapter(source.kind)).not.toThrow();
      expect(source.url.trim()).not.toBe('');
    }
  });
});

describe('fetchSources', () => {
  const sources: SourceInput[] = [
    { kind: 'rss', name: 'Working feed', url: 'https://example.test/feed.xml' },
    { kind: 'rss', name: 'Dead feed', url: 'https://example.test/gone.xml' },
  ];

  it('isolates a failing source from the rest of the run', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes('gone')
        ? new Response('nope', { status: 404 })
        : new Response(FEED),
    );

    const [working, dead] = await fetchSources(sources, {
      http: { fetch, sleep: async () => {} },
    });

    if (working?.status !== 'ok' || dead?.status !== 'failed') {
      throw new Error('expected one successful and one failed outcome');
    }
    expect(working.result.items).toHaveLength(1);
    expect(dead.error.message).toMatch(/HTTP 404/);
  });
});
