import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceConfigError, type SourceInput } from '../types.js';
import { githubAdapter, parseRepo } from './github.js';

const RELEASES = [
  {
    id: 101,
    html_url: 'https://github.com/sonatype/nexus-public/releases/tag/release-3.90.0',
    tag_name: 'release-3.90.0',
    name: 'Nexus Repository 3.90.0',
    body: 'Adds SBOM export.',
    draft: false,
    prerelease: false,
    published_at: '2026-08-12T09:00:00Z',
    author: { login: 'sonatype-bot' },
  },
  {
    id: 102,
    html_url: 'https://github.com/sonatype/nexus-public/releases/tag/release-3.91.0-rc1',
    tag_name: 'release-3.91.0-rc1',
    name: null,
    body: null,
    draft: false,
    prerelease: true,
    published_at: '2026-08-13T09:00:00Z',
    author: null,
  },
  { id: 103, tag_name: 'broken' },
];

const source: SourceInput = {
  kind: 'github',
  name: 'Nexus Repository Releases',
  url: 'sonatype/nexus-public',
};

function respondWith(payload: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(payload),
  );
}

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
});

describe('parseRepo', () => {
  it('accepts owner/repo and full GitHub URLs', () => {
    expect(parseRepo('sonatype/nexus-public')).toEqual({
      owner: 'sonatype',
      repo: 'nexus-public',
    });
    expect(parseRepo('https://github.com/docker/cli.git')).toEqual({
      owner: 'docker',
      repo: 'cli',
    });
    expect(parseRepo('not-a-repo')).toBeUndefined();
  });
});

describe('githubAdapter', () => {
  it('maps published releases and skips pre-releases by default', async () => {
    const fetch = respondWith(RELEASES);

    const { items, warnings } = await githubAdapter.fetch(source, { http: { fetch } });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: 'github:sonatype/nexus-public:101',
      title: 'sonatype/nexus-public Nexus Repository 3.90.0',
      author: 'sonatype-bot',
      content: 'Adds SBOM export.',
    });
    expect(warnings).toHaveLength(1);
  });

  it('includes pre-releases when the source opts in', async () => {
    const fetch = respondWith(RELEASES);

    const { items } = await githubAdapter.fetch(
      { ...source, config: JSON.stringify({ includePrereleases: true }) },
      { http: { fetch } },
    );

    expect(items.map((item) => item.externalId)).toEqual([
      'github:sonatype/nexus-public:102',
      'github:sonatype/nexus-public:101',
    ]);
  });

  it('sends the API version header and a token when configured', async () => {
    // jfrog-ignore
    process.env.GITHUB_TOKEN = 'token-123';
    const fetch = respondWith([]);

    await githubAdapter.fetch(source, { http: { fetch }, maxItems: 5 });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://api.github.com/repos/sonatype/nexus-public/releases?per_page=5',
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token-123');
    expect(headers.get('x-github-api-version')).toBe('2022-11-28');
  });

  it('rejects a locator that is not a repository', async () => {
    const fetch = respondWith([]);

    await expect(
      githubAdapter.fetch({ ...source, url: 'nexus' }, { http: { fetch } }),
    ).rejects.toBeInstanceOf(SourceConfigError);
  });

  it('rejects a malformed config blob', async () => {
    const fetch = respondWith([]);

    await expect(
      githubAdapter.fetch({ ...source, config: '{oops' }, { http: { fetch } }),
    ).rejects.toThrow(/malformed config JSON/);
  });
});
