export {
  readComparisonMatrix,
  defaultMatrixPath,
  suggestMatrixUpdates,
  suggestionIdFor,
  buildDeterministicDraft,
  CELL_LEVELS,
  type CellLevel,
  type MatrixCell,
  type MatrixAxis,
  type MatrixVendor,
  type ComparisonMatrix,
  type MatrixSuggestion,
  type SuggestOptions,
} from './matrix.js';
export {
  approveMatrixSuggestion,
  MATRIX_ASSET_KIND,
  matrixCellKey,
  readMatrixCellAudit,
  readReviewedSuggestionIds,
  rejectMatrixSuggestion,
  type ApplyMatrixEditResult,
  type MatrixCellAudit,
} from './apply.js';
export {
  confidenceFreshness,
  confidenceLevelFromScore,
  confidenceScore,
  deriveConfidence,
  CONFIDENCE_FRESHNESS_HALF_LIFE_DAYS,
  CONFIDENCE_HIGH_THRESHOLD,
  CONFIDENCE_MEDIUM_THRESHOLD,
  CONFIDENCE_WEIGHTS,
  CORROBORATION_CAP,
  type ConfidenceFactors,
  type ConfidenceInput,
  type ConfidenceLevel,
  type ConfidenceResult,
} from './confidence.js';
export { readVendorEvidence, type EvidenceSignal } from './evidence.js';
export {
  explainMatrix,
  type CellExplainability,
  type ExplainOptions,
} from './explain.js';
export {
  createOpenRouterMatrixDrafter,
  draftMatrixEdits,
  MATRIX_EDIT_PROMPT_VERSION,
  parseDraftedEdit,
  readMatrixEditModelConfig,
  type MatrixEditDrafter,
} from './draft.js';
