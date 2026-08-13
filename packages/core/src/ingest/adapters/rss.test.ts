import { describe, expect, it, vi } from 'vitest';
import type { SourceInput } from '../types.js';
import { rssAdapter } from './rss.js';

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Sonatype Blog</title>
    <item>
      <title>Nexus Repository 3.90 &amp; new SBOM export</title>
      <link>https://blog.example.test/nexus-390</link>
      <guid isPermaLink="false">post-1</guid>
      <dc:creator>Ilkka Turunen</dc:creator>
      <pubDate>Wed, 12 Aug 2026 09:30:00 +0000</pubDate>
      <description>Short teaser</description>
      <content:encoded><![CDATA[<p>Nexus <b>3.90</b> ships SBOM export.</p><p>Available today.</p>]]></content:encoded>
    </item>
    <item>
      <title>Post without a link</title>
      <description>orphan</description>
    </item>
    <item>
      <title>Older release notes</title>
      <link>https://blog.example.test/older</link>
      <pubDate>Mon, 03 Aug 2026 08:00:00 +0000</pubDate>
      <description>Older body</description>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>GitLab Blog</title>
  <entry>
    <title>GitLab 19.3 released</title>
    <link rel="alternate" href="https://about.example.test/gitlab-19-3"/>
    <link rel="enclosure" href="https://about.example.test/cover.png"/>
    <id>urn:uuid:1234</id>
    <author><name>GitLab</name></author>
    <published>2026-08-13T10:00:00Z</published>
    <content type="html">&lt;p&gt;Package registry improvements.&lt;/p&gt;</content>
  </entry>
</feed>`;

function respondWith(body: string) {
  return vi.fn(
    async () => new Response(body, { headers: { 'content-type': 'application/xml' } }),
  );
}

const source: SourceInput = {
  kind: 'rss',
  name: 'Sonatype Blog',
  url: 'https://blog.example.test/rss.xml',
};

describe('rssAdapter', () => {
  it('maps RSS 2.0 items to fetched items, newest first', async () => {
    const fetch = respondWith(RSS_FEED);

    const { items, warnings } = await rssAdapter.fetch(source, { http: { fetch } });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      externalId: 'post-1',
      url: 'https://blog.example.test/nexus-390',
      title: 'Nexus Repository 3.90 & new SBOM export',
      author: 'Ilkka Turunen',
    });
    expect(items[0]!.content).toBe('Nexus 3.90 ships SBOM export.\n\nAvailable today.');
    expect(items[0]!.publishedAt?.toISOString()).toBe('2026-08-12T09:30:00.000Z');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/without a usable title\/link/);
  });

  it('reads Atom entries and prefers the alternate link', async () => {
    const fetch = respondWith(ATOM_FEED);

    const { items } = await rssAdapter.fetch(
      { kind: 'rss', name: 'GitLab Blog', url: 'https://about.example.test/atom.xml' },
      { http: { fetch } },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: 'https://about.example.test/gitlab-19-3',
      author: 'GitLab',
      content: 'Package registry improvements.',
    });
  });

  it('drops items already seen on the previous run', async () => {
    const fetch = respondWith(RSS_FEED);

    const { items } = await rssAdapter.fetch(
      { ...source, lastFetchedAt: new Date('2026-08-10T00:00:00Z') },
      { http: { fetch } },
    );

    expect(items.map((item) => item.url)).toEqual([
      'https://blog.example.test/nexus-390',
    ]);
  });

  it('caps the number of items returned', async () => {
    const fetch = respondWith(RSS_FEED);

    const { items } = await rssAdapter.fetch(source, { http: { fetch }, maxItems: 1 });

    expect(items).toHaveLength(1);
  });

  it('warns instead of throwing when a feed returns no entries', async () => {
    const fetch = respondWith('<html><body>Moved</body></html>');

    const { items, warnings } = await rssAdapter.fetch(source, { http: { fetch } });

    expect(items).toEqual([]);
    expect(warnings[0]).toMatch(/feed shape may have changed/);
  });
});
