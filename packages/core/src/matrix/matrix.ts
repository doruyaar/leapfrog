/**
 * The competitive comparison matrix (build-plan issue 14): a curated grid of
 * capability axes × vendors. The matrix itself is a **human-owned, versioned asset**
 * (`data/matrix/comparison.json`) — never machine-written — because a comparison table is
 * a claim we stand behind, and an LLM guessing cells is exactly the ungrounded behaviour
 * this product refuses.
 *
 * What the corpus *does* drive is {@link suggestMatrixUpdates}: it surfaces recent, ranked
 * signals that touch a vendor/axis so a human editor knows which curated cells to revisit.
 * Suggestions are advisory (a review queue), applied only by a person — the "suggested
 * updates (human-approved)" contract from the plan.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { CATEGORIES, type Category } from '../db/schema.js';
import { readSignals } from '../query/signals.js';
import { signalScore } from '../brief/rank.js';

/** How strongly a vendor covers an axis — drives the cell colour. */
export const CELL_LEVELS = ['strong', 'partial', 'none', 'info'] as const;
export type CellLevel = (typeof CELL_LEVELS)[number];

const cellSchema = z.object({
  level: z.enum(CELL_LEVELS),
  note: z.string().min(1),
});

const axisSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  /** Signal categories that make a new signal relevant to this axis. */
  categories: z.array(z.enum(CATEGORIES)).min(1),
  /** Cell per vendor name; a missing vendor renders as "not covered". */
  cells: z.record(z.string(), cellSchema),
});

const vendorSchema = z.object({ name: z.string().min(1), slug: z.string().min(1) });

const matrixSchema = z.object({
  focusVendor: z.string().min(1),
  vendors: z.array(vendorSchema).min(1),
  axes: z.array(axisSchema).min(1),
});

export type MatrixCell = z.infer<typeof cellSchema>;
export type MatrixAxis = z.infer<typeof axisSchema>;
export type MatrixVendor = z.infer<typeof vendorSchema>;
export type ComparisonMatrix = z.infer<typeof matrixSchema>;

/**
 * Walk up to the workspace root (the manifest that declares `workspaces`) so the asset
 * resolves the same from `dist/`, `tsx`, or vitest regardless of the process cwd.
 */
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
      throw new Error('could not locate the workspace root to load the matrix from');
    }
    dir = parent;
  }
}

/** Default on-disk location of the curated matrix. */
export function defaultMatrixPath(): string {
  return join(workspaceRoot(), 'data', 'matrix', 'comparison.json');
}

/** Read and validate the curated comparison matrix. Throws on a malformed asset. */
export function readComparisonMatrix(
  path: string = defaultMatrixPath(),
): ComparisonMatrix {
  const parsed = matrixSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`invalid comparison matrix at ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** A grounded, human-reviewable suggestion to revisit one curated cell. */
export interface MatrixSuggestion {
  /** Stable identity for the approval audit trail: `vendor::axis::signal`. */
  suggestionId: string;
  vendor: string;
  axisId: string;
  axisLabel: string;
  /** The cell as it stands today, so the reviewer sees what might change. */
  currentLevel: CellLevel;
  currentNote: string;
  /**
   * The drafted edit (GAP-PLAN §5.2): what the cell would become if approved.
   * Deterministic by construction — level unchanged, note extended with a cited
   * sentence from the signal's validated summary; a live model may replace it,
   * but only with a citation-checked draft.
   */
  proposed: MatrixCell;
  /** The signal that prompts the review. */
  signalId: number;
  signalTitle: string;
  signalSummary: string;
  category: Category;
  impactScore: number;
  publishedAt: Date | null;
  /** Impact × recency; higher means "review this sooner". */
  score: number;
}

export interface SuggestOptions {
  now?: Date;
  /** Ignore signals below this impact — low-impact news is not worth a review. */
  minImpact?: number;
  /** Cap on the number of suggestions returned. */
  limit?: number;
  /** Suggestion ids already approved or rejected; these never resurface. */
  reviewedSuggestionIds?: ReadonlySet<string>;
}

/** The stable identity of one (vendor, axis, signal) suggestion. */
export function suggestionIdFor(vendor: string, axisId: string, signalId: number): string {
  return `${vendor}::${axisId}::${signalId}`;
}

/** First sentence of a validated summary — the citable core of a drafted note. */
function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return (match ? match[0] : text.trim()).trim();
}

/**
 * The deterministic drafted edit: never changes the curated level, appends one
 * cited sentence from the signal's summary to the human-written note. Grounded by
 * construction — every word is either already curated or quoted from a validated
 * enrichment, and the citation resolves to the driving signal.
 */
export function buildDeterministicDraft(
  cell: MatrixCell | undefined,
  signalId: number,
  signalSummary: string,
): MatrixCell {
  const sentence = `${firstSentence(signalSummary)} [#${signalId}]`;
  if (!cell) return { level: 'info', note: sentence };
  return { level: cell.level, note: `${cell.note} — ${sentence}` };
}

/**
 * Derive a ranked review queue from the corpus: for each vendor column, find recent
 * signals whose category maps to an axis and propose revisiting that cell. At most one
 * suggestion per (vendor, axis) — the strongest signal — so the queue stays actionable.
 * Nothing is written; a human decides whether the curated cell actually changes.
 */
export function suggestMatrixUpdates(
  db: Database,
  matrix: ComparisonMatrix = readComparisonMatrix(),
  options: SuggestOptions = {},
): MatrixSuggestion[] {
  const now = options.now ?? new Date();
  const minImpact = options.minImpact ?? 3;
  const limit = options.limit ?? 8;

  const reviewed = options.reviewedSuggestionIds ?? new Set<string>();
  const bestByCell = new Map<string, MatrixSuggestion>();
  for (const vendor of matrix.vendors) {
    const signals = readSignals(db, { vendor: vendor.name });
    for (const signal of signals) {
      if (signal.impactScore < minImpact) continue;
      for (const axis of matrix.axes) {
        if (!axis.categories.includes(signal.category)) continue;
        const suggestionId = suggestionIdFor(vendor.name, axis.id, signal.id);
        if (reviewed.has(suggestionId)) continue;
        const key = `${vendor.name}::${axis.id}`;
        const score = signalScore(signal.impactScore, signal.publishedAt, now);
        const existing = bestByCell.get(key);
        if (existing && existing.score >= score) continue;

        const cell = axis.cells[vendor.name];
        bestByCell.set(key, {
          suggestionId,
          vendor: vendor.name,
          axisId: axis.id,
          axisLabel: axis.label,
          currentLevel: cell?.level ?? 'none',
          currentNote: cell?.note ?? '—',
          proposed: buildDeterministicDraft(cell, signal.id, signal.summary),
          signalId: signal.id,
          signalTitle: signal.title,
          signalSummary: signal.summary,
          category: signal.category,
          impactScore: signal.impactScore,
          publishedAt: signal.publishedAt,
          score,
        });
      }
    }
  }

  return [...bestByCell.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
