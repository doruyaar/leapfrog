import { describe, expect, it } from 'vitest';
import type { FetchedItem } from '../ingest/types.js';
import { hashContent, hashUrl } from './hash.js';
import { normalizeItem, normalizeItems } from './items.js';

function item(overrides: Partial<FetchedItem> = {}): FetchedItem {
  return {
    url: 'https://jfrog.com/blog/release?utm_source=rss',
    title: 'Artifactory  7.99 released',
    content: '  Adds SBOM export.  ',
    raw: { id: 1 },
    ...overrides,
  };
}

describe('normalizeItem', () => {
  it('derives the canonical URL, both hashes, and tidy text', () => {
    const row = normalizeItem(7, item({ publishedAt: new Date('2026-08-12T09:30:00Z') }));

    expect(row.sourceId).toBe(7);
    expect(row.canonicalUrl).toBe('https://jfrog.com/blog/release');
    expect(row.urlHash).toBe(hashUrl('https://jfrog.com/blog/release'));
    expect(row.contentHash).toBe(
      hashContent('Artifactory 7.99 released', 'Adds SBOM export.'),
    );
    expect(row.title).toBe('Artifactory 7.99 released');
    expect(row.content).toBe('Adds SBOM export.');
    // The URL as published is kept alongside the canonical form, for attribution.
    expect(row.url).toBe('https://jfrog.com/blog/release?utm_source=rss');
    expect(row.rawJson).toBe('{"id":1}');
    expect(row.publishedAt).toEqual(new Date('2026-08-12T09:30:00Z'));
  });

  it('falls back to the title when the source gives no body', () => {
    expect(normalizeItem(1, item({ content: '   ' })).content).toBe(
      'Artifactory 7.99 released',
    );
  });

  it('tolerates a payload JSON cannot serialise', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(normalizeItem(1, item({ raw: circular })).rawJson).toBeUndefined();
  });
});

describe('normalizeItems', () => {
  it('drops items it cannot address, keeping the rest of the payload', () => {
    const { items, warnings } = normalizeItems(1, [
      item(),
      item({ url: 'mailto:security@jfrog.com', title: 'Advisory' }),
    ]);

    expect(items).toHaveLength(1);
    expect(warnings[0]).toMatch(/skipped "Advisory".*unsupported scheme/);
  });

  it('collapses repeats inside one payload, by URL and by body', () => {
    const { items, warnings } = normalizeItems(1, [
      item(),
      item({ url: 'https://www.jfrog.com/blog/release/' }),
      item({
        url: 'https://jfrog.com/blog/release-mirror',
        title: 'Artifactory 7.99 released',
      }),
      item({
        url: 'https://jfrog.com/blog/other',
        title: 'Xray update',
        content: 'New scanner.',
      }),
    ]);

    expect(items.map((row) => row.canonicalUrl)).toEqual([
      'https://jfrog.com/blog/release',
      'https://jfrog.com/blog/other',
    ]);
    expect(warnings).toEqual([
      'collapsed repeated URL in payload: https://jfrog.com/blog/release',
      'collapsed repeated body in payload: https://jfrog.com/blog/release-mirror',
    ]);
  });
});
