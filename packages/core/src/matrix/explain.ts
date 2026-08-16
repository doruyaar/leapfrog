/**
 * The per-cell "why this rating" view for the comparison matrix.
 *
 * For every cell it assembles the three things an analyst needs to trust a rating —
 * the supporting evidence (most relevant first), the confidence indication derived
 * from that evidence, and when an approved edit last touched the cell — without
 * inventing anything: evidence is read from the corpus, confidence from the
 * documented heuristic, and "last updated" from the immutable approval audit trail.
 */
import type { Database } from '../db/client.js';
import {
  deriveConfidence,
  type ConfidenceFactors,
  type ConfidenceLevel,
} from './confidence.js';
import { readVendorEvidence, type EvidenceSignal } from './evidence.js';
import type { CellLevel, ComparisonMatrix } from './matrix.js';
import { matrixCellKey, readMatrixCellAudit } from './apply.js';

/** The full "why this rating" view for one cell. */
export interface CellExplainability {
  vendor: string;
  axisId: string;
  axisLabel: string;
  level: CellLevel;
  note: string;
  /** Supporting signals, most relevant first (capped for display). */
  evidence: EvidenceSignal[];
  /** Total supporting signals, even when more than the displayed cap. */
  evidenceCount: number;
  confidence: ConfidenceLevel;
  confidenceFactors: ConfidenceFactors;
  /** When an approved edit last touched this cell, or `null` if never. */
  lastUpdatedAt: Date | null;
  /** The signal that drove that last approved edit, if any. */
  lastUpdatedSignalId: number | null;
}

export interface ExplainOptions {
  now?: Date;
  /** Cap on supporting signals surfaced per cell (kept most-relevant-first). */
  evidenceLimit?: number;
  /**
   * Only signals at or above this impact count as supporting evidence. Low-impact
   * mentions are noise, not evidence for a capability rating, and counting them would
   * overstate how well-backed a cell is. Defaults to the review threshold (3).
   */
  minImpact?: number;
}

/**
 * Build the explainability view for every cell in the matrix, keyed by
 * `vendor::axisId`. For each vendor we read its evidence once, then fan it out to the
 * axes whose categories match. Confidence is derived from all matching evidence; the
 * displayed list is capped so a popover stays compact. The audit trail supplies the
 * "last updated" facts.
 */
export function explainMatrix(
  db: Database,
  matrix: ComparisonMatrix,
  options: ExplainOptions = {},
): Map<string, CellExplainability> {
  const now = options.now ?? new Date();
  const evidenceLimit = options.evidenceLimit ?? 5;
  const minImpact = options.minImpact ?? 3;
  const audit = readMatrixCellAudit(db);

  const result = new Map<string, CellExplainability>();
  for (const vendor of matrix.vendors) {
    const vendorEvidence = readVendorEvidence(db, vendor.name, now);
    for (const axis of matrix.axes) {
      const cell = axis.cells[vendor.name];
      const matching = vendorEvidence.filter(
        (e) => axis.categories.includes(e.category) && e.impactScore >= minImpact,
      );
      const confidence = deriveConfidence(
        matching.map((e) => ({
          impactScore: e.impactScore,
          publishedAt: e.publishedAt,
          primary: e.tier === 'primary',
        })),
        now,
      );
      const key = matrixCellKey(vendor.name, axis.id);
      const cellAudit = audit.get(key);
      result.set(key, {
        vendor: vendor.name,
        axisId: axis.id,
        axisLabel: axis.label,
        level: cell?.level ?? 'none',
        note: cell?.note ?? '—',
        evidence: matching.slice(0, evidenceLimit),
        evidenceCount: matching.length,
        confidence: confidence.level,
        confidenceFactors: confidence.factors,
        lastUpdatedAt: cellAudit?.approvedAt ?? null,
        lastUpdatedSignalId: cellAudit?.signalId ?? null,
      });
    }
  }
  return result;
}
