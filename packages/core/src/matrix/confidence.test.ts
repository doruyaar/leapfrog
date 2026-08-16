import { describe, expect, it } from 'vitest';
import {
  confidenceFreshness,
  deriveConfidence,
  type ConfidenceInput,
} from './confidence.js';

const NOW = new Date('2026-08-16T00:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe('confidenceFreshness', () => {
  it('is 1 for something published now and halves each half-life', () => {
    expect(confidenceFreshness(NOW, NOW)).toBeCloseTo(1);
    expect(confidenceFreshness(daysAgo(30), NOW)).toBeCloseTo(0.5, 2);
    expect(confidenceFreshness(daysAgo(60), NOW)).toBeCloseTo(0.25, 2);
  });

  it('is 0 for an undated signal', () => {
    expect(confidenceFreshness(null, NOW)).toBe(0);
  });
});

describe('deriveConfidence', () => {
  it('is a genuine Low with no evidence — never an error or a guess', () => {
    const result = deriveConfidence([], NOW);
    expect(result.level).toBe('low');
    expect(result.score).toBe(0);
    expect(result.factors).toEqual({
      evidenceCount: 0,
      maxImpact: 0,
      freshness: 0,
      hasPrimarySource: false,
    });
  });

  it('rates a fresh, high-impact, primary-sourced signal High', () => {
    const evidence: ConfidenceInput[] = [
      { impactScore: 5, publishedAt: daysAgo(3), primary: true },
    ];
    expect(deriveConfidence(evidence, NOW).level).toBe('high');
  });

  it('rates a single ageing secondary signal Medium or lower, not High', () => {
    const evidence: ConfidenceInput[] = [
      { impactScore: 3, publishedAt: daysAgo(20), primary: false },
    ];
    expect(deriveConfidence(evidence, NOW).level).not.toBe('high');
  });

  it('rewards corroboration: more supporting signals raise the score', () => {
    const one = deriveConfidence(
      [{ impactScore: 4, publishedAt: daysAgo(5), primary: false }],
      NOW,
    ).score;
    const three = deriveConfidence(
      [
        { impactScore: 4, publishedAt: daysAgo(5), primary: false },
        { impactScore: 3, publishedAt: daysAgo(6), primary: false },
        { impactScore: 3, publishedAt: daysAgo(7), primary: false },
      ],
      NOW,
    ).score;
    expect(three).toBeGreaterThan(one);
  });

  it('takes the strongest impact and freshest date across the evidence', () => {
    const { factors } = deriveConfidence(
      [
        { impactScore: 2, publishedAt: daysAgo(40), primary: false },
        { impactScore: 5, publishedAt: daysAgo(2), primary: true },
      ],
      NOW,
    );
    expect(factors.maxImpact).toBe(5);
    expect(factors.hasPrimarySource).toBe(true);
    expect(factors.freshness).toBeGreaterThan(0.9);
  });
});
