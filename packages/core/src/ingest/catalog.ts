/**
 * The starting source catalog: the feeds, repositories, and CVE queries that cover
 * the focus vendor (JFrog) and its ten tracked competitors (docs/DESIGN.md §3):
 * Sonatype, GitLab, GitHub, Docker, Cloudsmith, Harbor, AWS, Microsoft/Azure, Snyk,
 * and Chainguard — the vendors in real head-to-head competition with JFrog across
 * artifact management, registries, and software-supply-chain security.
 *
 * This is seed configuration, not a fixed list — sources are rows in the `sources`
 * table and analysts add or disable them from the admin UI. Every entry here is a
 * public feed or documented free API; nothing is scraped.
 */
import type { SourceInput } from './types.js';

export type CatalogSource = SourceInput & { vendor: string | null };

export const FOCUS_VENDOR = 'JFrog';

/**
 * The canonical roster of JFrog's most-related competitors — the only companies the
 * product surfaces as competitors. Vendor rosters are *derived* from signals
 * ({@link ../query/vendors.readVendors}), so under live ingest the enrichment model can
 * name-drop arbitrary companies from neutral feeds; filtering every competitor surface to
 * this set keeps the roster to the direct rivals a JFrog seller actually cares about,
 * across artifact management, registries, and software-supply-chain security.
 *
 * This is product config, not code: edit the list to change who we track. Keep it to the
 * ~10–15 vendors in genuine head-to-head competition with JFrog (docs/DESIGN.md §3).
 */
export const TRACKED_COMPETITORS = [
  'Sonatype',
  'GitLab',
  'GitHub',
  'Docker',
  'Cloudsmith',
  'Harbor',
  'AWS',
  'Microsoft',
  'Snyk',
  'Chainguard',
] as const;

export const DEFAULT_SOURCES: CatalogSource[] = [
  // --- Focus vendor -------------------------------------------------------
  {
    kind: 'rss',
    name: 'JFrog Blog',
    url: 'https://jfrog.com/blog/feed/',
    vendor: 'JFrog',
  },
  { kind: 'github', name: 'JFrog CLI Releases', url: 'jfrog/jfrog-cli', vendor: 'JFrog' },

  // --- Direct competitors: artifact management & registries ---------------
  {
    kind: 'rss',
    name: 'Sonatype Blog',
    url: 'https://blog.sonatype.com/rss.xml',
    vendor: 'Sonatype',
  },
  {
    kind: 'github',
    name: 'Nexus Repository Releases',
    url: 'sonatype/nexus-public',
    vendor: 'Sonatype',
  },
  {
    kind: 'rss',
    name: 'GitLab Blog',
    url: 'https://about.gitlab.com/atom.xml',
    vendor: 'GitLab',
  },
  {
    kind: 'rss',
    name: 'GitHub Changelog',
    url: 'https://github.blog/changelog/feed/',
    vendor: 'GitHub',
  },
  {
    kind: 'rss',
    name: 'Docker Blog',
    url: 'https://www.docker.com/blog/feed/',
    vendor: 'Docker',
  },
  {
    kind: 'github',
    name: 'Docker Registry Releases',
    url: 'distribution/distribution',
    vendor: 'Docker',
  },
  {
    kind: 'rss',
    name: 'Cloudsmith Blog',
    url: 'https://cloudsmith.com/blog/rss/',
    vendor: 'Cloudsmith',
  },
  { kind: 'github', name: 'Harbor Releases', url: 'goharbor/harbor', vendor: 'Harbor' },
  {
    kind: 'rss',
    name: 'AWS DevOps Blog',
    url: 'https://aws.amazon.com/blogs/devops/feed/',
    vendor: 'AWS',
  },
  {
    kind: 'rss',
    name: 'Azure DevOps Blog',
    url: 'https://devblogs.microsoft.com/devops/feed/',
    vendor: 'Microsoft',
  },

  // --- Security-adjacent competitors (compete with Xray / supply-chain) ---
  { kind: 'rss', name: 'Snyk Blog', url: 'https://snyk.io/blog/feed/', vendor: 'Snyk' },
  { kind: 'github', name: 'Snyk CLI Releases', url: 'snyk/cli', vendor: 'Snyk' },
  {
    kind: 'rss',
    name: 'Chainguard Unchained',
    url: 'https://www.chainguard.dev/unchained/rss.xml',
    vendor: 'Chainguard',
  },

  // --- Market coverage (vendor-neutral) -----------------------------------
  {
    kind: 'rss',
    name: 'The Register — DevOps',
    url: 'https://www.theregister.com/software/devops/headlines.atom',
    vendor: null,
  },
  { kind: 'rss', name: 'InfoQ', url: 'https://feed.infoq.com/', vendor: null },
  {
    kind: 'rss',
    name: 'The New Stack',
    url: 'https://thenewstack.io/feed/',
    vendor: null,
  },
  { kind: 'rss', name: 'DevClass', url: 'https://devclass.com/feed/', vendor: null },

  // --- Vulnerabilities ----------------------------------------------------
  {
    kind: 'nvd',
    name: 'NVD — JFrog Artifactory',
    url: 'cpe:2.3:a:jfrog:artifactory',
    vendor: 'JFrog',
    config: JSON.stringify({ lookbackDays: 120 }),
  },
  {
    kind: 'nvd',
    name: 'NVD — Sonatype Nexus',
    url: 'cpe:2.3:a:sonatype:nexus_repository_manager',
    vendor: 'Sonatype',
    config: JSON.stringify({ lookbackDays: 120 }),
  },
  {
    kind: 'nvd',
    name: 'NVD — GitLab',
    url: 'cpe:2.3:a:gitlab:gitlab',
    vendor: 'GitLab',
    config: JSON.stringify({ lookbackDays: 30, minCvssScore: 7 }),
  },
  {
    kind: 'nvd',
    name: 'NVD — Docker Desktop',
    url: 'cpe:2.3:a:docker:docker_desktop',
    vendor: 'Docker',
    config: JSON.stringify({ lookbackDays: 120 }),
  },
];
