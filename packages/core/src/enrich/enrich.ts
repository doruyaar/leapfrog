/**
 * Stage 3 of the pipeline: turn raw items into validated, scored, cited enrichments
 * (docs/DESIGN.md §5). The guarantees that matter here (ADR-0003):
 *
 * - **Nothing unvalidated reaches the UI.** A model completion is parsed and zod-checked;
 *   on any failure the row is written with status `quarantined` and a reason, never shown.
 * - **Transport failures are retried, not quarantined.** A network/HTTP error leaves no
 *   row, so the next run picks the item up again — only bad *output* is quarantined.
 * - **Every call is observable.** Model, prompt version, request id, latency, and token
 *   counts are stored on the row (ok or quarantined) from day one.
 * - **Re-running is safe.** Writes upsert on `raw_item_id`, so re-enriching an item
 *   (revised content, retried quarantine) replaces its row rather than duplicating it.
 */
import type { Database } from '../db/client.js';
import { enrichedItems, type NewEnrichedItem } from '../db/schema.js';
import {
  createOpenRouterModel,
  readOpenRouterConfig,
  type EnrichmentModel,
} from './client.js';
import { ENRICH_PROMPT_VERSION } from './prompt.js';
import { parseEnrichmentOutput } from './schema.js';
import {
  selectInputsByIds,
  selectPendingInputs,
  type EnrichmentInput,
} from './select.js';

/**
 * Placeholder category for a quarantined row. The NOT NULL columns still need values
 * even though the row is filtered out everywhere; the real signal is `quarantineReason`.
 */
const QUARANTINE_CATEGORY = 'Ecosystem' as const;

export type EnrichItemOutcome =
  | { rawItemId: number; status: 'ok'; category: string; impactScore: number }
  | { rawItemId: number; status: 'quarantined'; reason: string }
  | { rawItemId: number; status: 'failed'; error: string };

export interface EnrichReport {
  attempted: number;
  enriched: number;
  quarantined: number;
  failed: number;
  outcomes: EnrichItemOutcome[];
}

export interface EnrichOptions {
  /** Completion source. Defaults to an OpenRouter model built from the environment. */
  model?: EnrichmentModel;
  /** Enrich exactly these raw items (e.g. an ingest run's `changedIds`). */
  rawItemIds?: number[];
  /** Cap when selecting pending items (ignored when `rawItemIds` is given). */
  maxItems?: number;
}

/**
 * Enrich a batch of raw items. Picks the model and the work set from `options`,
 * processes items sequentially (one in-flight request keeps us inside provider rate
 * limits), and returns a per-item report.
 */
export async function enrichItems(
  db: Database,
  options: EnrichOptions = {},
): Promise<EnrichReport> {
  const model = options.model ?? createOpenRouterModel(readOpenRouterConfig());
  const inputs = options.rawItemIds
    ? selectInputsByIds(db, options.rawItemIds)
    : selectPendingInputs(db, { limit: options.maxItems });

  const outcomes: EnrichItemOutcome[] = [];
  for (const input of inputs) {
    outcomes.push(await enrichOne(db, model, input));
  }

  return {
    attempted: inputs.length,
    enriched: outcomes.filter((o) => o.status === 'ok').length,
    quarantined: outcomes.filter((o) => o.status === 'quarantined').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    outcomes,
  };
}

/** Enrich a single item: call the model, validate, persist ok or quarantined. */
async function enrichOne(
  db: Database,
  model: EnrichmentModel,
  input: EnrichmentInput,
): Promise<EnrichItemOutcome> {
  const observability = {
    model: model.model,
    promptVersion: ENRICH_PROMPT_VERSION,
    requestId: null as string | null,
    latencyMs: null as number | null,
    promptTokens: null as number | null,
    completionTokens: null as number | null,
  };

  let completion;
  try {
    completion = await model.complete(input);
  } catch (error) {
    // Transport/HTTP failure: write nothing so the item is retried next run.
    return {
      rawItemId: input.rawItemId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  observability.requestId = completion.requestId;
  observability.latencyMs = completion.latencyMs;
  observability.promptTokens = completion.promptTokens;
  observability.completionTokens = completion.completionTokens;

  const parsed = parseEnrichmentOutput(completion.content);

  if (!parsed.ok) {
    writeEnrichment(db, {
      rawItemId: input.rawItemId,
      category: QUARANTINE_CATEGORY,
      impactScore: 1,
      summary: '',
      whyItMatters: '',
      status: 'quarantined',
      quarantineReason: parsed.reason,
      ...observability,
    });
    return { rawItemId: input.rawItemId, status: 'quarantined', reason: parsed.reason };
  }

  writeEnrichment(db, {
    rawItemId: input.rawItemId,
    ...parsed.fields,
    status: 'ok',
    quarantineReason: null,
    ...observability,
  });

  return {
    rawItemId: input.rawItemId,
    status: 'ok',
    category: parsed.fields.category,
    impactScore: parsed.fields.impactScore,
  };
}

/** Upsert one enriched row, keyed on `raw_item_id` so re-enrichment replaces it. */
function writeEnrichment(db: Database, row: NewEnrichedItem): void {
  db.insert(enrichedItems)
    .values(row)
    .onConflictDoUpdate({
      target: enrichedItems.rawItemId,
      set: {
        category: row.category,
        vendors: row.vendors ?? '[]',
        products: row.products ?? '[]',
        impactScore: row.impactScore,
        summary: row.summary,
        whyItMatters: row.whyItMatters,
        rationale: row.rationale ?? null,
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
