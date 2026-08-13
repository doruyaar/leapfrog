/**
 * GitHub Releases adapter — the ground truth for what a competitor actually shipped
 * in their OSS products, usually days before it reaches a blog post.
 *
 * Unauthenticated requests are limited to 60/hour per IP; setting `GITHUB_TOKEN`
 * raises that to 5,000/hour. The adapter works either way.
 */
import { z } from 'zod';
import { fetchJson } from '../http.js';
import { parseSourceConfig, toResult } from '../shared.js';
import { parseDate, truncate } from '../text.js';
import {
  DEFAULT_MAX_ITEMS,
  SourceConfigError,
  type FetchContext,
  type FetchResult,
  type FetchedItem,
  type SourceAdapter,
  type SourceInput,
} from '../types.js';

const configSchema = z.object({
  /** Pre-releases are noisy for most vendors, so they are opt-in per source. */
  includePrereleases: z.boolean().default(false),
});

const releaseSchema = z.object({
  id: z.number(),
  html_url: z.string(),
  tag_name: z.string(),
  name: z.string().nullish(),
  body: z.string().nullish(),
  draft: z.boolean().default(false),
  prerelease: z.boolean().default(false),
  published_at: z.string().nullish(),
  created_at: z.string().nullish(),
  author: z.object({ login: z.string() }).nullish(),
});

/** Accepts `owner/repo` or any github.com URL pointing at the repository. */
export function parseRepo(locator: string): { owner: string; repo: string } | undefined {
  const path = locator.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '');
  const [owner, repo] = path
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .split('/');
  return owner && repo ? { owner, repo } : undefined;
}

export const githubAdapter: SourceAdapter = {
  kind: 'github',
  locatorHint: 'Repository as `owner/repo`, e.g. sonatype/nexus-public',

  async fetch(source: SourceInput, context: FetchContext = {}): Promise<FetchResult> {
    const config = parseSourceConfig(source, configSchema);
    const repo = parseRepo(source.url);
    if (!repo) {
      throw new SourceConfigError(
        `source "${source.name}" is not a GitHub repository locator: ${source.url}`,
        source,
      );
    }

    const perPage = Math.min(context.maxItems ?? DEFAULT_MAX_ITEMS, 100);
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=${perPage}`;
    const token = process.env.GITHUB_TOKEN;

    const payload = await fetchJson<unknown>(
      url,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
      context.http,
    );

    const warnings: string[] = [];
    const items: FetchedItem[] = [];

    for (const entry of Array.isArray(payload) ? payload : []) {
      const parsed = releaseSchema.safeParse(entry);
      if (!parsed.success) {
        warnings.push(`skipped a release from ${source.url} with an unexpected shape`);
        continue;
      }

      const release = parsed.data;
      if (release.draft) continue;
      if (release.prerelease && !config.includePrereleases) continue;

      const title = release.name?.trim() || release.tag_name;
      items.push({
        externalId: `github:${repo.owner}/${repo.repo}:${release.id}`,
        url: release.html_url,
        title: `${repo.owner}/${repo.repo} ${title}`,
        author: release.author?.login,
        content: truncate(
          release.body?.trim() || `Release ${release.tag_name} published.`,
        ),
        publishedAt: parseDate(release.published_at ?? release.created_at),
        raw: release,
      });
    }

    if (!Array.isArray(payload)) {
      warnings.push(
        `unexpected GitHub response for ${source.url} — expected a release array`,
      );
    }

    return toResult(source, items, warnings, context);
  },
};
