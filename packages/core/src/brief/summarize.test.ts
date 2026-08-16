import { describe, expect, it } from 'vitest';
import { buildInsightsBlock, parseBriefDraft } from './summarize.js';
import type { BriefSource } from './compose.js';

describe('parseBriefDraft', () => {
  it('parses a well-formed draft and strips a code fence', () => {
    const raw =
      '```json\n{"summary":"S [#1]","claims":[{"text":"t","sourceId":1,"quote":"q"}],"conflicts":[]}\n```';
    const draft = parseBriefDraft(raw);
    expect(draft.summary).toBe('S [#1]');
    expect(draft.claims).toHaveLength(1);
    expect(draft.conflicts).toEqual([]);
  });

  it('defaults missing claim/conflict arrays', () => {
    const draft = parseBriefDraft('{"summary":"only a summary [#1]"}');
    expect(draft.claims).toEqual([]);
    expect(draft.conflicts).toEqual([]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBriefDraft('not json')).toThrow();
  });

  it('throws when a conflict has fewer than two sides', () => {
    const raw =
      '{"summary":"s","claims":[],"conflicts":[{"topic":"t","sides":[{"text":"a","sourceId":1,"quote":"q"}],"note":"n"}]}';
    expect(() => parseBriefDraft(raw)).toThrow(/schema mismatch/);
  });
});

describe('buildInsightsBlock', () => {
  it('tags each source and includes its quotable body', () => {
    const sources: BriefSource[] = [
      {
        id: 12,
        title: 'Title',
        url: 'https://x.test',
        category: 'Security',
        vendor: 'JFrog',
        impactScore: 4,
        summary: 'A summary',
        whyItMatters: 'why',
        publishedAt: null,
        score: 1,
        content: 'The full source body to quote from.',
      },
    ];
    const block = buildInsightsBlock(sources);
    expect(block).toContain('[#12]');
    expect(block).toContain('(JFrog)');
    expect(block).toContain('full source body');
  });
});
