export { createOpenRouterDiffModel, type DiffModel } from './client.js';
export {
  cosineFromL2,
  DEFAULT_SIMILARITY_THRESHOLD,
  readDiffModelConfig,
  readSimilarityThreshold,
} from './config.js';
export {
  classifyAgainstPriors,
  classifyRevision,
  findSimilarPriors,
  readLatestRevision,
  toDimension,
  type DiffClassification,
} from './deterministic.js';
export {
  diffItems,
  type DiffItemOutcome,
  type DiffItemsOptions,
  type DiffProgress,
  type DiffReport,
} from './diff.js';
export {
  defaultChangePairsPath,
  evaluateChangePairs,
  readChangePairs,
  type ChangeEvalReport,
  type ChangePair,
  type ChangePairResult,
} from './eval.js';
export {
  clearFacts,
  insertFact,
  readCurrentFact,
  readCurrentFacts,
  readFactByEvidence,
  supersedeFact,
  type NewFactInput,
} from './facts.js';
export {
  buildDiffMessages,
  DETERMINISTIC_MODEL,
  DIFF_DETERMINISTIC_VERSION,
  DIFF_PROMPT_VERSION,
  loadDiffPromptTemplate,
  shownItemIds,
  type DiffPromptContext,
  type SimilarPrior,
} from './prompt.js';
export {
  diffOutputSchema,
  parseDiffOutput,
  type DiffOutput,
  type DiffParseFailure,
  type DiffParseSuccess,
} from './schema.js';
export {
  selectDiffInputsByIds,
  selectPendingDiffInputs,
  type DiffInput,
  type SelectPendingDiffOptions,
} from './select.js';
export { diffSentences, splitSentences, type SentenceDiff } from './sentences.js';
