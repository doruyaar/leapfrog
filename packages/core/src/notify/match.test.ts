import { describe, expect, it } from 'vitest';
import type { Category } from '../db/schema.js';
import {
  describeSubscription,
  matchSignal,
  type MatchableSignal,
  type SubscriptionFilters,
} from './match.js';

function signal(overrides: Partial<MatchableSignal> = {}): MatchableSignal {
  return {
    vendor: 'Sonatype',
    category: 'Security',
    impactScore: 4,
    title: 'Nexus CVE patched',
    summary: 'A critical vulnerability was fixed',
    whyItMatters: 'affects our shared customers',
    ...overrides,
  };
}

const ANY: SubscriptionFilters = {
  vendors: [],
  categories: [],
  keywords: [],
  minImpact: null,
};

describe('matchSignal', () => {
  it('matches everything when no filters are set', () => {
    expect(matchSignal({ ...ANY }, signal())).toBe(true);
  });

  it('enforces the impact floor', () => {
    expect(matchSignal({ ...ANY, minImpact: 5 }, signal({ impactScore: 4 }))).toBe(false);
    expect(matchSignal({ ...ANY, minImpact: 4 }, signal({ impactScore: 4 }))).toBe(true);
  });

  it('matches vendors case-insensitively, OR within the facet', () => {
    expect(matchSignal({ ...ANY, vendors: ['sonatype'] }, signal())).toBe(true);
    expect(matchSignal({ ...ANY, vendors: ['GitLab', 'Docker'] }, signal())).toBe(false);
    expect(matchSignal({ ...ANY, vendors: ['GitLab'] }, signal({ vendor: null }))).toBe(
      false,
    );
  });

  it('matches categories', () => {
    expect(matchSignal({ ...ANY, categories: ['Security'] }, signal())).toBe(true);
    expect(matchSignal({ ...ANY, categories: ['Pricing'] }, signal())).toBe(false);
  });

  it('matches keywords across title, summary, and why-it-matters', () => {
    expect(matchSignal({ ...ANY, keywords: ['cve'] }, signal())).toBe(true);
    expect(matchSignal({ ...ANY, keywords: ['customers'] }, signal())).toBe(true);
    expect(matchSignal({ ...ANY, keywords: ['pricing'] }, signal())).toBe(false);
  });

  it('ANDs facets together', () => {
    const filters: SubscriptionFilters = {
      vendors: ['Sonatype'],
      categories: ['Security'] as Category[],
      keywords: ['cve'],
      minImpact: 4,
    };
    expect(matchSignal({ ...filters }, signal())).toBe(true);
    expect(matchSignal({ ...filters }, signal({ category: 'Pricing' }))).toBe(false);
    expect(matchSignal({ ...filters }, signal({ impactScore: 2 }))).toBe(false);
  });
});

describe('describeSubscription', () => {
  it('reads as "All insights" when empty', () => {
    expect(describeSubscription({ ...ANY })).toBe('All insights');
  });

  it('builds a plain-English sentence from the filters', () => {
    expect(
      describeSubscription({
        vendors: ['Sonatype'],
        categories: ['Security'] as Category[],
        keywords: ['CVE'],
        minImpact: 4,
      }),
    ).toBe("Security insights about Sonatype at impact 4+ mentioning 'CVE'");
  });
});
