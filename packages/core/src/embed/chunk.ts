/**
 * Chunking: splitting an item's text into retrieval-sized passages (docs/DESIGN.md §4).
 *
 * Pure and deterministic — no I/O, no model — so the same text always yields the same
 * chunks and the logic is trivially unit-testable. The embedder truncates internally, so
 * the token budget here only needs to be a sensible estimate: we pack whole sentences up
 * to a target size, carry a little overlap into the next chunk so a fact split across a
 * boundary is still retrievable, and hard-split any single sentence that runs past the
 * cap. Everything downstream keys off `index`, so ordering is stable.
 */

/** A single passage produced from an item's text. */
export interface TextChunk {
  /** Position within the item, starting at 0 — the `chunk_index` column. */
  index: number;
  content: string;
  /** Estimated token count (see {@link estimateTokens}); stored for observability. */
  tokenCount: number;
}

export interface ChunkOptions {
  /** Preferred chunk size; a chunk is emitted once it reaches this many tokens. */
  targetTokens?: number;
  /** Hard cap: a lone sentence longer than this is force-split by words. */
  maxTokens?: number;
  /** Tokens of trailing context carried from one chunk into the next. */
  overlapTokens?: number;
}

export const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptions> = {
  targetTokens: 220,
  maxTokens: 320,
  overlapTokens: 40,
};

/**
 * Rough token estimate without loading a tokenizer. Word count scaled by a constant
 * over-counts slightly versus a real BPE tokenizer, which is the safe direction: it
 * makes chunks a little smaller, never larger than the model's context window.
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}

/** Collapse runs of whitespace, drop leading/trailing space, keep the text on one line. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Split text into sentence-ish units. Breaks on sentence punctuation followed by
 * whitespace and on blank lines, keeping the punctuation attached to its sentence.
 * Falls back to the whole (normalized) string when there is nothing to split on.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

/** Force-split an over-long sentence into <= maxTokens word runs, preserving order. */
function splitLongSentence(sentence: string, maxTokens: number): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const perChunk = Math.max(1, Math.floor(maxTokens / 1.3));
  const parts: string[] = [];
  for (let i = 0; i < words.length; i += perChunk) {
    parts.push(words.slice(i, i + perChunk).join(' '));
  }
  return parts;
}

/** Take whole trailing sentences summing up to ~overlapTokens, to seed the next chunk. */
function overlapTail(sentences: string[], overlapTokens: number): string[] {
  if (overlapTokens <= 0) return [];
  const tail: string[] = [];
  let budget = overlapTokens;
  for (let i = sentences.length - 1; i >= 0 && budget > 0; i -= 1) {
    const sentence = sentences[i]!;
    tail.unshift(sentence);
    budget -= estimateTokens(sentence);
  }
  return tail;
}

/**
 * Split text into overlapping, sentence-aligned chunks. Sentences are packed until the
 * running size would exceed `targetTokens`; the finished chunk keeps a short overlap tail
 * so context spanning a boundary survives. Empty or whitespace-only input yields no chunks.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const { targetTokens, maxTokens, overlapTokens } = {
    ...DEFAULT_CHUNK_OPTIONS,
    ...options,
  };
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const sentences = splitSentences(normalized).flatMap((sentence) =>
    estimateTokens(sentence) > maxTokens
      ? splitLongSentence(sentence, maxTokens)
      : [sentence],
  );

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    if (current.length > 0 && currentTokens + tokens > targetTokens) {
      chunks.push(current.join(' '));
      current = overlapTail(current, overlapTokens);
      currentTokens = current.reduce((sum, s) => sum + estimateTokens(s), 0);
    }
    current.push(sentence);
    currentTokens += tokens;
  }

  if (current.length > 0) chunks.push(current.join(' '));

  return chunks.map((content, index) => ({
    index,
    content,
    tokenCount: estimateTokens(content),
  }));
}

/**
 * Build the document text that gets chunked for one item. Prepending the title gives the
 * opening chunk the item's subject even when the body dives straight into detail, which
 * measurably helps retrieval on short news/CVE items.
 */
export function buildDocument(title: string, content: string): string {
  const head = normalizeWhitespace(title);
  const body = normalizeWhitespace(content);
  if (!head) return body;
  if (!body) return head;
  return `${head}\n\n${body}`;
}
