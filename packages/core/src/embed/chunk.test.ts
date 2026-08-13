import { describe, expect, it } from 'vitest';
import { buildDocument, chunkText, estimateTokens } from './chunk.js';

/** A sentence of roughly `tokens` estimated tokens, made of distinct words. */
function sentence(prefix: string, words: number): string {
  return `${Array.from({ length: words }, (_, i) => `${prefix}${i}`).join(' ')}.`;
}

describe('estimateTokens', () => {
  it('scales with word count and never returns zero', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('one two three')).toBe(Math.ceil(3 * 1.3));
    expect(estimateTokens('  spaced   out  ')).toBe(Math.ceil(2 * 1.3));
  });
});

describe('buildDocument', () => {
  it('prepends the title so the first chunk carries the subject', () => {
    expect(buildDocument('Title', 'Body text')).toBe('Title\n\nBody text');
  });

  it('tolerates a missing title or body', () => {
    expect(buildDocument('', 'Body only')).toBe('Body only');
    expect(buildDocument('Title only', '')).toBe('Title only');
  });
});

describe('chunkText', () => {
  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  it('keeps short text as a single chunk indexed from zero', () => {
    const chunks = chunkText('One sentence. Two sentence.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[0]!.content).toBe('One sentence. Two sentence.');
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it('splits into sequentially indexed chunks once the target is exceeded', () => {
    const text = [sentence('a', 60), sentence('b', 60), sentence('c', 60)].join(' ');
    const chunks = chunkText(text, { targetTokens: 100, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => expect(chunk.index).toBe(i));
  });

  it('carries an overlap tail from one chunk into the next', () => {
    const text = [
      sentence('alpha', 50),
      sentence('bravo', 50),
      sentence('charlie', 50),
    ].join(' ');
    const withOverlap = chunkText(text, { targetTokens: 80, overlapTokens: 80 });
    expect(withOverlap.length).toBeGreaterThan(1);
    // The last sentence of chunk 0 should reappear at the start of chunk 1.
    const firstTail = withOverlap[0]!.content.split('. ').at(-1)!;
    expect(withOverlap[1]!.content.startsWith(firstTail.replace(/\.$/, ''))).toBe(true);
  });

  it('hard-splits a single sentence that runs past the max', () => {
    const giant = sentence('word', 400);
    const chunks = chunkText(giant, {
      targetTokens: 100,
      maxTokens: 120,
      overlapTokens: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(120);
    }
  });

  it('is deterministic', () => {
    const text = [sentence('x', 40), sentence('y', 40), sentence('z', 40)].join(' ');
    expect(chunkText(text)).toEqual(chunkText(text));
  });
});
