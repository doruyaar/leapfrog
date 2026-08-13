import { describe, expect, it } from 'vitest';
import { numberFlag, parseFlags, stringFlag } from './args.js';

const SPEC = { values: ['kind', 'max'], switches: ['json'] } as const;

describe('parseFlags', () => {
  it('reads values and switches in any order', () => {
    expect(parseFlags(['--json', '--kind', 'nvd', '--max', '3'], SPEC)).toEqual({
      json: true,
      kind: 'nvd',
      max: '3',
    });
    expect(parseFlags([], SPEC)).toEqual({});
  });

  it('refuses a typo rather than silently ignoring it', () => {
    expect(() => parseFlags(['--knid', 'nvd'], SPEC)).toThrow(/unknown option: --knid/);
  });

  it('refuses a value option with nothing to consume', () => {
    expect(() => parseFlags(['--kind'], SPEC)).toThrow(/--kind needs a value/);
    expect(() => parseFlags(['--kind', '--json'], SPEC)).toThrow(/--kind needs a value/);
  });
});

describe('flag readers', () => {
  it('returns undefined for absent options', () => {
    expect(stringFlag({}, 'kind')).toBeUndefined();
    expect(numberFlag({}, 'max')).toBeUndefined();
  });

  it('rejects numbers a stage cannot act on', () => {
    expect(numberFlag({ max: '25' }, 'max', { min: 1 })).toBe(25);
    expect(() => numberFlag({ max: 'lots' }, 'max')).toThrow(/--max must be a number/);
    expect(() => numberFlag({ max: '0' }, 'max', { min: 1 })).toThrow(
      /--max must be at least 1/,
    );
  });
});
