import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceInput } from '../types.js';
import { buildQueryUrl, nvdAdapter } from './nvd.js';

function cve(id: string, score: number | undefined, published: string) {
  return {
    cve: {
      id,
      published,
      lastModified: published,
      descriptions: [
        { lang: 'es', value: 'descripción' },
        { lang: 'en', value: `${id} allows remote code execution.` },
      ],
      metrics:
        score === undefined
          ? {}
          : {
              cvssMetricV31: [
                { cvssData: { baseScore: score, baseSeverity: 'CRITICAL' } },
              ],
            },
      references: [{ url: 'https://vendor.example.test/advisory' }],
    },
  };
}

const PAYLOAD = {
  totalResults: 3,
  vulnerabilities: [
    cve('CVE-2026-1000', 9.8, '2026-08-12T10:00:00.000'),
    cve('CVE-2026-1001', 4.2, '2026-08-11T10:00:00.000'),
    { cve: { published: '2026-08-10T10:00:00.000' } },
  ],
};

const source: SourceInput = {
  kind: 'nvd',
  name: 'NVD — Sonatype Nexus',
  url: 'cpe:2.3:a:sonatype:nexus_repository_manager',
};

function respondWith(payload: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(payload),
  );
}

afterEach(() => {
  delete process.env.NVD_API_KEY;
});

describe('buildQueryUrl', () => {
  const now = new Date('2026-08-13T00:00:00.000Z');

  it('uses virtualMatchString for CPE locators and bounds the window', () => {
    const url = new URL(buildQueryUrl('cpe:2.3:a:jfrog:artifactory', 30, now, 50));

    expect(url.searchParams.get('virtualMatchString')).toBe(
      'cpe:2.3:a:jfrog:artifactory',
    );
    expect(url.searchParams.get('pubStartDate')).toBe('2026-07-14T00:00:00.000');
    expect(url.searchParams.get('pubEndDate')).toBe('2026-08-13T00:00:00.000');
    expect(url.searchParams.get('resultsPerPage')).toBe('50');
    expect(url.search).toContain('noRejected');
  });

  it('falls back to a keyword search for non-CPE locators', () => {
    const url = new URL(buildQueryUrl('Cloudsmith', 7, now, 10));

    expect(url.searchParams.get('keywordSearch')).toBe('Cloudsmith');
    expect(url.searchParams.get('virtualMatchString')).toBeNull();
  });
});

describe('nvdAdapter', () => {
  it('maps CVEs with severity and references', async () => {
    const fetch = respondWith(PAYLOAD);

    const { items, warnings } = await nvdAdapter.fetch(source, { http: { fetch } });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      externalId: 'CVE-2026-1000',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1000',
      title: 'CVE-2026-1000 (CRITICAL 9.8)',
    });
    expect(items[0]!.content).toContain('remote code execution');
    expect(items[0]!.content).toContain('https://vendor.example.test/advisory');
    expect(warnings).toHaveLength(1);
  });

  it('applies the minimum CVSS filter', async () => {
    const fetch = respondWith(PAYLOAD);

    const { items } = await nvdAdapter.fetch(
      { ...source, config: JSON.stringify({ minCvssScore: 7 }) },
      { http: { fetch } },
    );

    expect(items.map((item) => item.externalId)).toEqual(['CVE-2026-1000']);
  });

  it('rejects a lookback window NVD would refuse', async () => {
    const fetch = respondWith(PAYLOAD);

    await expect(
      nvdAdapter.fetch(
        { ...source, config: JSON.stringify({ lookbackDays: 400 }) },
        { http: { fetch } },
      ),
    ).rejects.toThrow(/invalid config/);
  });

  it('sends the API key when one is configured', async () => {
    process.env.NVD_API_KEY = 'nvd-key';
    const fetch = respondWith({ vulnerabilities: [] });

    await nvdAdapter.fetch(source, { http: { fetch } });

    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('apikey')).toBe('nvd-key');
  });

  it('warns rather than throwing when the payload shape is unknown', async () => {
    const fetch = respondWith({ message: 'service unavailable' });

    const { items, warnings } = await nvdAdapter.fetch(source, { http: { fetch } });

    expect(items).toEqual([]);
    expect(warnings[0]).toMatch(/unexpected NVD response/);
  });
});
