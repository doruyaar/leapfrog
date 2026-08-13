export {
  recencyWeight,
  signalScore,
  rankSignals,
  RECENCY_HALF_LIFE_DAYS,
  type RankedSignal,
  type RankOptions,
} from './rank.js';
export {
  buildExtractiveSummary,
  citationsAreValid,
  composeBrief,
  extractCitations,
  BRIEF_PROMPT_VERSION,
  EXTRACTIVE_MODEL,
  type BriefItem,
  type BriefSummarizer,
  type ComposeBriefOptions,
  type ComposedBrief,
} from './compose.js';
export {
  readBriefByDate,
  readLatestBrief,
  saveBrief,
  type StoredBrief,
} from './store.js';
export {
  notifyHighImpact,
  ALERT_THRESHOLD,
  type NotifyOptions,
  type NotifyResult,
} from './notify.js';
