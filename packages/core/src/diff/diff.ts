/**
 * Stage 3.5 of the pipeline (GAP-PLAN §3.2): decide, for every enriched item, whether
 * it *changes* the recorded vendor state — and record what changed, from what, with
 * what evidence. Sits between enrich and brief:
 *
 *   Sources → Ingest → Enrich → **Diff** → Embed → Brief
 *
 * The guarantees mirror the rest of the pipeline:
 * - **Always producible.** Demo mode (no key) runs a fully deterministic path:
 *   textual diff for revised items, local-embedding similarity for new ones. The
 *   live model is an upgrade, and any live failure falls back to deterministic.
 * - **Nothing unvalidated reaches the UI.** Live output is zod-checked and its
 *   evidence citations must resolve to items the model was shown.
 * - **Re-running is safe.** Events upsert on `trigger_item_id`; selection returns
 *   only items without an event; fact writes are guarded so a re-diff of an
 *   unchanged item reuses its facts instead of duplicating them.
 * - **Every call is observable.** Model, prompt version, request id, latency, and
 *   token counts land on each row — deterministic rows carry their own stamp.
 */
import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../db/client.js';
import {
  changeEvents,
  vendorFacts,
  type ChangeEvent,
  type ChangeKind,
  type NewChangeEvent,
} from '../db/schema.js';
import { createLocalEmbedder, type Embedder } from '../embed/model.js';
import { MissingApiKeyError, type ModelCompletion } from '../enrich/client.js';
import { createOpenRouterDiffModel, type DiffModel } from './client.js';
import { readDiffModelConfig, readSimilarityThreshold } from './config.js';
import {
  classifyAgainstPriors,
  classifyRevision,
  findSimilarPriors,
  readLatestRevision,
  type DiffClassification,
} from './deterministic.js';
import {
  clearFacts,
  insertFact,
  readCurrentFact,
  readCurrentFacts,
  readFactByEvidence,
  supersedeFact,
} from './facts.js';
import {
  DETERMINISTIC_MODEL,
  DIFF_DETERMINISTIC_VERSION,
  DIFF_PROMPT_VERSION,
  shownItemIds,
  type DiffPromptContext,
} from './prompt.js';
import { parseDiffOutput } from './schema.js';
import {
  selectDiffInputsByIds,
  selectPendingDiffInputs,
  type DiffInput,
} from './select.js';

/** Vendor label for items no vendor could be attributed to. */
const MARKET_VENDOR = 'Market';

export type DiffItemOutcome =
  | {
      rawItemId: number;
      status: 'ok';
      kind: ChangeKind;
      dimension: string;
      materiality: number;
      /** True when the live model produced the event (vs. the deterministic path). */
      live: boolean;
    }
  | { rawItemId: number; status: 'failed'; error: string };

export interface DiffReport {
  attempted: number;
  byKind: Record<ChangeKind, number>;
  failed: number;
  outcomes: DiffItemOutcome[];
}

/** Where an item sits in the batch, for progress reporting. */
export interface DiffProgress {
  index: number;
  total: number;
  rawItemId: number;
  title: string;
}

export interface DiffItemsOptions {
  /**
   * Completion source for live mode. `undefined` builds one from the environment
   * when a key is present; `null` forces the deterministic path.
   */
  model?: DiffModel | null;
  /** Embedding source for the similarity check. Defaults to the local model. */
  embedder?: Embedder;
  /** Diff exactly these raw items (e.g. an ingest run's `changedIds`). */
  rawItemIds?: number[];
  /** Cap when selecting pending items (ignored when `rawItemIds` is given). */
  maxItems?: number;
  /** Drop all change events and vendor facts, then replay the whole corpus. */
  rebuild?: boolean;
  /** Override `DIFF_SIMILARITY_THRESHOLD`. */
  similarityThreshold?: number;
  onItemStart?: (progress: DiffProgress) => void;
  onItemComplete?: (
    progress: DiffProgress & { outcome: DiffItemOutcome; elapsedMs: number },
  ) => void;
}

/** Build the live model from the environment, or `null` in demo mode (no key). */
function modelFromEnv(): DiffModel | null {
  try {
    return createOpenRouterDiffModel(readDiffModelConfig());
  } catch (error) {
    if (error instanceof MissingApiKeyError) return null;
    throw error;
  }
}

/**
 * Diff a batch of enriched items against the recorded vendor state. Processes
 * oldest-first and strictly sequentially, because each event may supersede the
 * facts the next one is compared against.
 */
export async function diffItems(
  db: Database,
  options: DiffItemsOptions = {},
): Promise<DiffReport> {
  const model = options.model === undefined ? modelFromEnv() : options.model;
  const embedder = options.embedder ?? createLocalEmbedder();
  const threshold = options.similarityThreshold ?? readSimilarityThreshold();

  if (options.rebuild) {
    db.transaction((tx) => {
      tx.delete(changeEvents).run();
      clearFacts(tx);
    });
  }

  const inputs = options.rawItemIds
    ? selectDiffInputsByIds(db, options.rawItemIds)
    : selectPendingDiffInputs(db, { limit: options.maxItems });

  const outcomes: DiffItemOutcome[] = [];
  const byKind: Record<ChangeKind, number> = {
    new: 0,
    update: 0,
    rephrase: 0,
    duplicate: 0,
  };

  let index = 0;
  for (const input of inputs) {
    index += 1;
    const progress: DiffProgress = {
      index,
      total: inputs.length,
      rawItemId: input.rawItemId,
      title: input.title,
    };
    options.onItemStart?.(progress);

    const startedAt = Date.now();
    const outcome = await diffOne(db, model, embedder, input, threshold);
    outcomes.push(outcome);
    if (outcome.status === 'ok') byKind[outcome.kind] += 1;

    options.onItemComplete?.({
      ...progress,
      outcome,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return {
    attempted: inputs.length,
    byKind,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    outcomes,
  };
}

/** Classify one item (live with deterministic fallback) and persist atomically. */
async function diffOne(
  db: Database,
  model: DiffModel | null,
  embedder: Embedder,
  input: DiffInput,
  threshold: number,
): Promise<DiffItemOutcome> {
  try {
    const revision = readLatestRevision(db, input.rawItemId);
    const facts = input.vendor ? readCurrentFacts(db, input.vendor) : [];
    // Revised items diff against their own pre-image; only fresh items need the
    // similarity search (which also feeds the live prompt's context).
    const priors =
      revision === undefined ? await findSimilarPriors(db, embedder, input, 5) : [];

    let classification: DiffClassification;
    let observability: Pick<
      NewChangeEvent,
      | 'model'
      | 'promptVersion'
      | 'requestId'
      | 'latencyMs'
      | 'promptTokens'
      | 'completionTokens'
    > = {
      model: DETERMINISTIC_MODEL,
      promptVersion: DIFF_DETERMINISTIC_VERSION,
      requestId: null,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
    };
    let live = false;

    if (revision) {
      classification = classifyRevision(input, revision);
    } else {
      classification = classifyAgainstPriors(input, priors, threshold);

      if (model) {
        const context: DiffPromptContext = { input, facts, similarPriors: priors };
        const upgraded = await tryLiveClassification(model, context);
        if (upgraded) {
          classification = upgraded.classification;
          observability = {
            model: model.model,
            promptVersion: DIFF_PROMPT_VERSION,
            requestId: upgraded.completion.requestId,
            latencyMs: upgraded.completion.latencyMs,
            promptTokens: upgraded.completion.promptTokens,
            completionTokens: upgraded.completion.completionTokens,
          };
          live = true;
        }
      }
    }

    db.transaction((tx) => {
      const factIds = applyFactChanges(tx, input, classification);
      writeChangeEvent(tx, {
        vendor: input.vendor ?? MARKET_VENDOR,
        dimension: classification.dimension,
        kind: classification.kind,
        before: classification.before,
        after: classification.after,
        materiality: classification.materiality,
        rationale: classification.rationale,
        triggerItemId: input.rawItemId,
        previousFactId: factIds.previousFactId,
        newFactId: factIds.newFactId,
        status: 'ok',
        quarantineReason: null,
        ...observability,
      });
    });

    return {
      rawItemId: input.rawItemId,
      status: 'ok',
      kind: classification.kind,
      dimension: classification.dimension,
      materiality: classification.materiality,
      live,
    };
  } catch (error) {
    // Embedding/write failure: no row, so the item is retried next run.
    return {
      rawItemId: input.rawItemId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Ask the live model and validate its answer. Returns `null` on any failure —
 * transport, JSON, schema, or ungrounded evidence — so the caller keeps the
 * deterministic classification. The diff, like the brief, is always producible.
 */
async function tryLiveClassification(
  model: DiffModel,
  context: DiffPromptContext,
): Promise<{ classification: DiffClassification; completion: ModelCompletion } | null> {
  let completion: ModelCompletion;
  try {
    completion = await model.complete(context);
  } catch {
    return null;
  }

  const parsed = parseDiffOutput(completion.content, {
    shownItemIds: shownItemIds(context),
    triggerItemId: context.input.rawItemId,
  });
  if (!parsed.ok) return null;

  const output = parsed.output;
  return {
    classification: {
      kind: output.kind,
      dimension: output.dimension,
      before: output.before,
      after: output.after,
      materiality: output.materiality,
      rationale: output.rationale,
      evidenceItemIds: output.evidence_item_ids,
    },
    completion,
  };
}

/**
 * Maintain the vendor-fact chain for one classified item, returning the fact ids the
 * change event should point at. Guarded for idempotency: re-diffing an item whose
 * event already produced an identical fact reuses it instead of appending a twin.
 */
function applyFactChanges(
  tx: Transaction,
  input: DiffInput,
  classification: DiffClassification,
): { previousFactId: number | null; newFactId: number | null } {
  if (!input.vendor) return { previousFactId: null, newFactId: null };

  const existing = tx
    .select()
    .from(changeEvents)
    .where(eq(changeEvents.triggerItemId, input.rawItemId))
    .get() as ChangeEvent | undefined;

  if (existing?.newFactId) {
    const existingFact = tx
      .select()
      .from(vendorFacts)
      .where(eq(vendorFacts.id, existing.newFactId))
      .get();
    if (existingFact && existingFact.fact === classification.after) {
      return { previousFactId: existing.previousFactId, newFactId: existing.newFactId };
    }
  }

  const validFrom = input.publishedAt ?? new Date();
  const { vendor } = input;
  const { dimension } = classification;

  switch (classification.kind) {
    case 'new': {
      const newFactId = insertFact(tx, {
        vendor,
        dimension,
        fact: classification.after,
        evidenceItemId: input.rawItemId,
        validFrom,
      });
      return { previousFactId: null, newFactId };
    }
    case 'update': {
      // A revision supersedes the fact its own item evidenced; otherwise the
      // update supersedes the vendor's current belief on this dimension.
      const previous =
        readFactByEvidence(tx, input.rawItemId) ?? readCurrentFact(tx, vendor, dimension);
      const newFactId = insertFact(tx, {
        vendor,
        dimension,
        fact: classification.after,
        evidenceItemId: input.rawItemId,
        validFrom,
      });
      if (previous) supersedeFact(tx, previous.id, newFactId);
      return { previousFactId: previous?.id ?? null, newFactId };
    }
    case 'rephrase':
    case 'duplicate': {
      // A re-statement moves nothing; link the fact it re-states when we have one.
      const evidenceId = classification.evidenceItemIds.find(
        (id) => id !== input.rawItemId,
      );
      const previous =
        evidenceId === undefined ? undefined : readFactByEvidence(tx, evidenceId);
      return { previousFactId: previous?.id ?? null, newFactId: null };
    }
  }
}

/** Upsert one change event, keyed on `trigger_item_id` so re-diffing replaces it. */
function writeChangeEvent(tx: Transaction, row: NewChangeEvent): void {
  tx.insert(changeEvents)
    .values(row)
    .onConflictDoUpdate({
      target: changeEvents.triggerItemId,
      set: {
        vendor: row.vendor,
        dimension: row.dimension,
        kind: row.kind,
        before: row.before ?? null,
        after: row.after,
        materiality: row.materiality,
        rationale: row.rationale ?? null,
        previousFactId: row.previousFactId ?? null,
        newFactId: row.newFactId ?? null,
        status: row.status ?? 'ok',
        quarantineReason: row.quarantineReason ?? null,
        model: row.model,
        promptVersion: row.promptVersion,
        requestId: row.requestId ?? null,
        latencyMs: row.latencyMs ?? null,
        promptTokens: row.promptTokens ?? null,
        completionTokens: row.completionTokens ?? null,
        createdAt: new Date(),
      },
    })
    .run();
}
