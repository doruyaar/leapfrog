/**
 * Deterministic sentence-level text diff for revised items (GAP-PLAN §3.2, demo path).
 * When a source republishes an item, the stored pre-image and the new content are
 * split into sentences and compared as sets: sentences only in the old text were
 * removed, sentences only in the new text were added. Zero inference — the
 * before/after pair a change card shows is the source's own words, verbatim.
 */

/** Split plain text into trimmed sentences (terminator-aware, newline-tolerant). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Normalize for comparison only — the verbatim sentence is what gets displayed. */
function comparisonKey(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface SentenceDiff {
  /** Sentences present in the previous text but not the current one. */
  removed: string[];
  /** Sentences present in the current text but not the previous one. */
  added: string[];
}

/** Compare two texts sentence-by-sentence. Empty diff = pure formatting change. */
export function diffSentences(previous: string, current: string): SentenceDiff {
  const previousSentences = splitSentences(previous);
  const currentSentences = splitSentences(current);
  const previousKeys = new Set(previousSentences.map(comparisonKey));
  const currentKeys = new Set(currentSentences.map(comparisonKey));

  return {
    removed: previousSentences.filter((s) => !currentKeys.has(comparisonKey(s))),
    added: currentSentences.filter((s) => !previousKeys.has(comparisonKey(s))),
  };
}
