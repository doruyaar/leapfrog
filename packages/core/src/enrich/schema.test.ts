import { describe, expect, it } from 'vitest';
import { parseEnrichmentOutput } from './schema.js';

const VALID = {
  category: 'Security',
  vendors: ['JFrog'],
  products: ['Artifactory'],
  impact_score: 5,
  summary: 'An actively-exploited CVE affects Artifactory.',
  why_it_matters: 'Customers must patch; a competitor will use it in deals.',
  rationale: 'Actively exploited in a focus-vendor product.',
};

describe('parseEnrichmentOutput', () => {
  it('accepts a well-formed completion and maps it to column shape', () => {
    const result = parseEnrichmentOutput(JSON.stringify(VALID));
    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

    expect(result.fields).toEqual({
      category: 'Security',
      vendors: '["JFrog"]',
      products: '["Artifactory"]',
      impactScore: 5,
      summary: VALID.summary,
      whyItMatters: VALID.why_it_matters,
      rationale: VALID.rationale,
    });
  });

  it('defaults optional arrays and rationale', () => {
    const { vendors, products, rationale, ...rest } = VALID;
    void vendors;
    void products;
    void rationale;
    const result = parseEnrichmentOutput(JSON.stringify(rest));
    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);

    expect(result.fields.vendors).toBe('[]');
    expect(result.fields.products).toBe('[]');
    expect(result.fields.rationale).toBeNull();
  });

  it('strips a JSON code fence some models add despite instructions', () => {
    const fenced = '```json\n' + JSON.stringify(VALID) + '\n```';
    expect(parseEnrichmentOutput(fenced).ok).toBe(true);
  });

  it('quarantines unparseable JSON with a reason', () => {
    const result = parseEnrichmentOutput('not json at all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/invalid JSON/);
  });

  it('quarantines an out-of-range impact score', () => {
    const result = parseEnrichmentOutput(JSON.stringify({ ...VALID, impact_score: 9 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/impact_score/);
  });

  it('quarantines an unknown category', () => {
    const result = parseEnrichmentOutput(JSON.stringify({ ...VALID, category: 'Weather' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/category/);
  });
});
