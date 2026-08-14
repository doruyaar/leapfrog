/**
 * The approval gate for drafted matrix edits (GAP-PLAN §5.2). The matrix stays a
 * human-owned asset: nothing here runs without a person clicking Approve. The
 * command (apply the edit, validated synchronously) is separated from the event
 * (an immutable `asset_revisions` row), and a rejection is recorded the same way
 * so a dismissed suggestion never resurfaces.
 */
import { writeFileSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { assetRevisions } from '../db/schema.js';
import {
  defaultMatrixPath,
  readComparisonMatrix,
  type MatrixCell,
  type MatrixSuggestion,
} from './matrix.js';

/** `asset_kind` value for comparison-matrix cells. */
export const MATRIX_ASSET_KIND = 'matrix';

/** `asset_key` of one matrix cell: `vendor::axisId`. */
export function matrixCellKey(vendor: string, axisId: string): string {
  return `${vendor}::${axisId}`;
}

/** Every suggestion id a human already decided on — approvals and rejections alike. */
export function readReviewedSuggestionIds(db: Database): Set<string> {
  const rows = db
    .select({ suggestionId: assetRevisions.suggestionId })
    .from(assetRevisions)
    .where(eq(assetRevisions.assetKind, MATRIX_ASSET_KIND))
    .all();
  return new Set(rows.map((r) => r.suggestionId));
}

/** The latest approved revision of one matrix cell, for the visible audit trail. */
export interface MatrixCellAudit {
  assetKey: string;
  after: MatrixCell;
  signalId: number | null;
  approvedAt: Date;
}

/** Latest approval per cell, keyed by `vendor::axisId`. */
export function readMatrixCellAudit(db: Database): Map<string, MatrixCellAudit> {
  const rows = db
    .select()
    .from(assetRevisions)
    .where(eq(assetRevisions.assetKind, MATRIX_ASSET_KIND))
    .orderBy(desc(assetRevisions.createdAt), desc(assetRevisions.id))
    .all();

  const audit = new Map<string, MatrixCellAudit>();
  for (const row of rows) {
    if (row.action !== 'approve' || audit.has(row.assetKey) || !row.after) continue;
    try {
      audit.set(row.assetKey, {
        assetKey: row.assetKey,
        after: JSON.parse(row.after) as MatrixCell,
        signalId: row.signalId,
        approvedAt: row.createdAt,
      });
    } catch {
      // An unreadable historical row must not break the page.
    }
  }
  return audit;
}

export interface ApplyMatrixEditResult {
  assetKey: string;
  before: MatrixCell | null;
  after: MatrixCell;
}

/**
 * Apply an approved drafted edit: rewrite the curated asset on disk and append the
 * immutable revision record. Validates that the target vendor and axis still exist
 * (the asset may have been hand-edited since the suggestion was computed).
 */
export function approveMatrixSuggestion(
  db: Database,
  suggestion: MatrixSuggestion,
  options: { matrixPath?: string } = {},
): ApplyMatrixEditResult {
  const path = options.matrixPath ?? defaultMatrixPath();
  // Re-read and re-validate the on-disk asset rather than trusting a stale copy.
  const matrix = readComparisonMatrix(path);

  const axis = matrix.axes.find((a) => a.id === suggestion.axisId);
  if (!axis) throw new Error(`matrix has no axis "${suggestion.axisId}"`);
  if (!matrix.vendors.some((v) => v.name === suggestion.vendor)) {
    throw new Error(`matrix has no vendor "${suggestion.vendor}"`);
  }

  const before = axis.cells[suggestion.vendor] ?? null;
  const after: MatrixCell = {
    level: suggestion.proposed.level,
    note: suggestion.proposed.note,
  };
  axis.cells[suggestion.vendor] = after;

  writeFileSync(path, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');

  const assetKey = matrixCellKey(suggestion.vendor, suggestion.axisId);
  db.insert(assetRevisions)
    .values({
      assetKind: MATRIX_ASSET_KIND,
      assetKey,
      action: 'approve',
      suggestionId: suggestion.suggestionId,
      before: before ? JSON.stringify(before) : null,
      after: JSON.stringify(after),
      signalId: suggestion.signalId,
    })
    .run();

  return { assetKey, before, after };
}

/** Record a dismissal, so the suggestion is settled without touching the asset. */
export function rejectMatrixSuggestion(db: Database, suggestion: MatrixSuggestion): void {
  const current: MatrixCell = {
    level: suggestion.currentLevel,
    note: suggestion.currentNote,
  };
  db.insert(assetRevisions)
    .values({
      assetKind: MATRIX_ASSET_KIND,
      assetKey: matrixCellKey(suggestion.vendor, suggestion.axisId),
      action: 'reject',
      suggestionId: suggestion.suggestionId,
      before: JSON.stringify(current),
      after: null,
      signalId: suggestion.signalId,
    })
    .run();
}
