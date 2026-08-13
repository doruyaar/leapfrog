/**
 * NVD CVE adapter (API 2.0) — vulnerabilities filed against competitor products.
 *
 * The locator is either a CPE match string (`cpe:2.3:a:sonatype:nexus:*:*:...`) for
 * precise product matching, or a plain keyword for vendors without clean CPEs.
 * NVD allows 5 requests / 30s anonymously and 50 with an `NVD_API_KEY`; the
 * adapter sends the key when present and otherwise relies on the retry policy.
 */
import { z } from 'zod';
import { fetchJson } from '../http.js';
import { parseSourceConfig, toResult } from '../shared.js';
import { parseDate, truncate } from '../text.js';
import {
  DEFAULT_MAX_ITEMS,
  type FetchContext,
  type FetchResult,
  type FetchedItem,
  type SourceAdapter,
  type SourceInput,
} from '../types.js';

const NVD_ENDPOINT = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

/** NVD rejects publication windows wider than 120 days. */
const MAX_LOOKBACK_DAYS = 120;

const configSchema = z.object({
  lookbackDays: z.number().int().min(1).max(MAX_LOOKBACK_DAYS).default(30),
  /** Drop low-severity noise; unscored CVEs are always kept for triage. */
  minCvssScore: z.number().min(0).max(10).optional(),
});

const cveSchema = z.object({
  id: z.string(),
  published: z.string().nullish(),
  lastModified: z.string().nullish(),
  sourceIdentifier: z.string().nullish(),
  descriptions: z.array(z.object({ lang: z.string(), value: z.string() })).default([]),
  metrics: z
    .object({
      cvssMetricV31: z
        .array(
          z.object({
            cvssData: z.object({ baseScore: z.number(), baseSeverity: z.string() }),
          }),
        )
        .optional(),
      cvssMetricV30: z
        .array(
          z.object({
            cvssData: z.object({ baseScore: z.number(), baseSeverity: z.string() }),
          }),
        )
        .optional(),
    })
    .default({}),
  references: z.array(z.object({ url: z.string() })).default([]),
});

const responseSchema = z.object({
  totalResults: z.number().optional(),
  // Required: a response without this key is an error page, not an empty result.
  vulnerabilities: z.array(z.object({ cve: z.unknown() })),
});

type Cve = z.infer<typeof cveSchema>;

/** NVD wants extended ISO-8601 without a trailing `Z`. */
function nvdDate(date: Date): string {
  return date.toISOString().replace(/Z$/, '');
}

function severityOf(cve: Cve): { score: number; label: string } | undefined {
  const metric = cve.metrics.cvssMetricV31?.[0] ?? cve.metrics.cvssMetricV30?.[0];
  return metric
    ? { score: metric.cvssData.baseScore, label: metric.cvssData.baseSeverity }
    : undefined;
}

function descriptionOf(cve: Cve): string {
  const english = cve.descriptions.find((d) => d.lang === 'en');
  return (english ?? cve.descriptions[0])?.value.trim() ?? '';
}

export function buildQueryUrl(
  locator: string,
  lookbackDays: number,
  now: Date,
  limit: number,
): string {
  const params = new URLSearchParams();
  const trimmed = locator.trim();

  // `virtualMatchString` accepts partial CPEs; `cpeName` would require a full one.
  if (trimmed.toLowerCase().startsWith('cpe:')) params.set('virtualMatchString', trimmed);
  else params.set('keywordSearch', trimmed);

  params.set(
    'pubStartDate',
    nvdDate(new Date(now.getTime() - lookbackDays * 86_400_000)),
  );
  params.set('pubEndDate', nvdDate(now));
  params.set('resultsPerPage', String(Math.min(limit, 2000)));

  // Valueless flag: exclude CVEs withdrawn by their assigner.
  return `${NVD_ENDPOINT}?${params.toString()}&noRejected`;
}

export const nvdAdapter: SourceAdapter = {
  kind: 'nvd',
  locatorHint: 'CPE match string (`cpe:2.3:a:vendor:product`) or a keyword query',

  async fetch(source: SourceInput, context: FetchContext = {}): Promise<FetchResult> {
    const config = parseSourceConfig(source, configSchema);
    const limit = context.maxItems ?? DEFAULT_MAX_ITEMS;
    const url = buildQueryUrl(source.url, config.lookbackDays, new Date(), limit);
    const apiKey = process.env.NVD_API_KEY;

    const payload = await fetchJson<unknown>(
      url,
      { headers: apiKey ? { apiKey } : {} },
      context.http,
    );

    const parsedResponse = responseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      return toResult(
        source,
        [],
        [`unexpected NVD response shape for ${source.url}`],
        context,
      );
    }

    const warnings: string[] = [];
    const items: FetchedItem[] = [];

    for (const entry of parsedResponse.data.vulnerabilities) {
      const parsed = cveSchema.safeParse(entry.cve);
      if (!parsed.success) {
        warnings.push(`skipped a CVE from ${source.url} with an unexpected shape`);
        continue;
      }

      const cve = parsed.data;
      const severity = severityOf(cve);
      if (
        config.minCvssScore !== undefined &&
        severity !== undefined &&
        severity.score < config.minCvssScore
      ) {
        continue;
      }

      const description = descriptionOf(cve);
      const heading = severity
        ? `${severity.label} ${severity.score.toFixed(1)}`
        : 'unscored';
      const references = cve.references
        .slice(0, 5)
        .map((reference) => `- ${reference.url}`)
        .join('\n');

      items.push({
        externalId: cve.id,
        url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
        title: `${cve.id} (${heading})`,
        content: truncate(
          [description, `CVSS: ${heading}`, references && `References:\n${references}`]
            .filter(Boolean)
            .join('\n\n'),
        ),
        publishedAt: parseDate(cve.published ?? cve.lastModified),
        raw: cve,
      });
    }

    return toResult(source, items, warnings, context);
  },
};
