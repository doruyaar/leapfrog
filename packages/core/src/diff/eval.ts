/**
 * Golden-dataset evaluation for change classification (GAP-PLAN §3.4). The labeled
 * pairs in `data/eval/change-pairs.json` pin the deterministic classifier's expected
 * behaviour: revised pairs must diff to `update`/`duplicate`, and similarity pairs
 * must land on the right side of `DIFF_SIMILARITY_THRESHOLD`. Runs entirely
 * key-free — the same local embeddings the pipeline uses.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChangeKind } from '../db/schema.js';
import type { Embedder } from '../embed/model.js';
import { diffSentences } from './sentences.js';

/** One labeled evaluation case. `revised: true` means "same item, republished". */
export interface ChangePair {
  id: string;
  /** What the pair exercises, for the report. */
  note?: string;
  /** The prior text (an older item, or the pre-image of a revision). */
  prior: string | null;
  /** The incoming text. */
  next: string;
  /** True when `next` is a revision of the same item (textual-diff path). */
  revised?: boolean;
  expectedKind: ChangeKind;
}

export interface ChangePairResult {
  id: string;
  expected: ChangeKind;
  actual: ChangeKind;
  correct: boolean;
  /** Cosine similarity, for similarity-path pairs. */
  similarity: number | null;
}

export interface ChangeEvalReport {
  total: number;
  correct: number;
  accuracy: number;
  results: ChangePairResult[];
}

function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ('workspaces' in JSON.parse(readFileSync(manifest, 'utf8'))) return dir;
      } catch {
        // Malformed manifest — keep walking up.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('could not locate the workspace root to load eval data from');
    }
    dir = parent;
  }
}

/** Default on-disk location of the golden change pairs. */
export function defaultChangePairsPath(): string {
  return join(workspaceRoot(), 'data', 'eval', 'change-pairs.json');
}

/** Read the golden pairs (defaults to `data/eval/change-pairs.json`). */
export function readChangePairs(path: string = defaultChangePairsPath()): ChangePair[] {
  const pairs = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(pairs)) throw new Error(`${path} must contain a JSON array`);
  return pairs as ChangePair[];
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i]! * b[i]!;
  return sum;
}

/** Classify one pair exactly the way the deterministic pipeline path would. */
async function classifyPair(
  embedder: Embedder,
  pair: ChangePair,
  threshold: number,
): Promise<{ kind: ChangeKind; similarity: number | null }> {
  if (pair.revised && pair.prior !== null) {
    const { removed, added } = diffSentences(pair.prior, pair.next);
    return {
      kind: removed.length === 0 && added.length === 0 ? 'duplicate' : 'update',
      similarity: null,
    };
  }

  if (pair.prior === null) return { kind: 'new', similarity: null };

  // Embeddings are unit vectors, so the dot product is the cosine similarity.
  const [a, b] = await embedder.embed([pair.prior, pair.next]);
  const similarity = dot(a!, b!);
  return { kind: similarity >= threshold ? 'rephrase' : 'new', similarity };
}

/** Run every golden pair through the deterministic classifier and score it. */
export async function evaluateChangePairs(
  embedder: Embedder,
  pairs: ChangePair[],
  threshold: number,
): Promise<ChangeEvalReport> {
  const results: ChangePairResult[] = [];
  for (const pair of pairs) {
    const { kind, similarity } = await classifyPair(embedder, pair, threshold);
    results.push({
      id: pair.id,
      expected: pair.expectedKind,
      actual: kind,
      correct: kind === pair.expectedKind,
      similarity,
    });
  }

  const correct = results.filter((r) => r.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 1 : correct / results.length,
    results,
  };
}
