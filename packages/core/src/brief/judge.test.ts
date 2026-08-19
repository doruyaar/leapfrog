import { describe, expect, it } from 'vitest';
import { decideContradiction, type ContradictionJudge } from './contradiction.js';
import { parseConflictVerdict } from './judge.js';

const A = 'Sonatype raised enterprise pricing by 20%';
const B = 'Sonatype says enterprise pricing is unchanged';

describe('parseConflictVerdict', () => {
  it('accepts a contradict verdict whose evidence is verbatim in both statements', () => {
    const result = parseConflictVerdict(
      JSON.stringify({
        verdict: 'contradict',
        evidenceA: 'raised enterprise pricing',
        evidenceB: 'pricing is unchanged',
      }),
      A,
      B,
    );
    expect(result.contradicts).toBe(true);
    expect(result.signals).toEqual([
      '"raised enterprise pricing" vs "pricing is unchanged"',
    ]);
  });

  it('accepts a consistent verdict without evidence', () => {
    const result = parseConflictVerdict(JSON.stringify({ verdict: 'consistent' }), A, B);
    expect(result).toEqual({ contradicts: false, signals: [] });
  });

  it('rejects a contradict verdict whose evidence is not verbatim', () => {
    expect(() =>
      parseConflictVerdict(
        JSON.stringify({
          verdict: 'contradict',
          evidenceA: 'increased its prices', // paraphrase, not in A
          evidenceB: 'pricing is unchanged',
        }),
        A,
        B,
      ),
    ).toThrow(/not verbatim/);
  });

  it('rejects a contradict verdict with missing evidence, bad JSON, or a bad shape', () => {
    expect(() =>
      parseConflictVerdict(JSON.stringify({ verdict: 'contradict' }), A, B),
    ).toThrow();
    expect(() => parseConflictVerdict('not json at all', A, B)).toThrow();
    expect(() =>
      parseConflictVerdict(JSON.stringify({ verdict: 'maybe' }), A, B),
    ).toThrow();
  });

  it('strips a code fence before parsing', () => {
    const fenced = '```json\n{"verdict":"consistent"}\n```';
    expect(parseConflictVerdict(fenced, A, B).contradicts).toBe(false);
  });
});

describe('decideContradiction', () => {
  const judgeSaying = (contradicts: boolean): ContradictionJudge => ({
    model: 'test/chat',
    promptVersion: 'conflict@1',
    judge: async () => ({ contradicts, signals: contradicts ? ['"x" vs "y"'] : [] }),
  });

  it('prefers the judge verdict over the deterministic measures', async () => {
    // Lexically these contradict ("raised" vs "unchanged"), but the judge says no.
    expect((await decideContradiction(A, B, judgeSaying(false))).contradicts).toBe(false);
    // Lexically a pure paraphrase pair finds nothing, but the judge says yes.
    const paraphraseA = 'Customers now pay more for the enterprise tier';
    const paraphraseB = 'The enterprise bill has stayed the same for customers';
    expect(
      (await decideContradiction(paraphraseA, paraphraseB, judgeSaying(true)))
        .contradicts,
    ).toBe(true);
  });

  it('falls back to the deterministic measures when the judge fails', async () => {
    const broken: ContradictionJudge = {
      model: 'test/chat',
      promptVersion: 'conflict@1',
      judge: async () => {
        throw new Error('model unreachable');
      },
    };
    const result = await decideContradiction(A, B, broken);
    expect(result.contradicts).toBe(true); // deterministic: "raised" vs "unchanged"
    expect(result.signals.join(' ')).toContain('raised');
  });

  it('uses the deterministic measures when no judge is configured', async () => {
    expect((await decideContradiction(A, B)).contradicts).toBe(true);
  });
});
