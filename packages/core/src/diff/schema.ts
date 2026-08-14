/**
 * The contract between the diff model and the store (GAP-PLAN §3.2). Like
 * enrichment, LLM output is never trusted: the model returns JSON, this schema
 * validates it, and `evidence_item_ids` must resolve to items the model was
 * actually shown — anything else falls back to the deterministic path.
 */
import { z } from 'zod';
import { CHANGE_KINDS, DIMENSIONS } from '../db/schema.js';

/** The JSON shape `prompts/diff.md` asks the model for. */
export const diffOutputSchema = z
  .object({
    kind: z.enum(CHANGE_KINDS),
    dimension: z.enum(DIMENSIONS),
    before: z.string().min(1).nullable().default(null),
    after: z.string().min(1),
    materiality: z.number().int().min(1).max(5),
    rationale: z.string().min(1),
    evidence_item_ids: z.array(z.number().int()).default([]),
  })
  .strip();

export type DiffOutput = z.infer<typeof diffOutputSchema>;

export interface DiffParseSuccess {
  ok: true;
  output: DiffOutput;
}

export interface DiffParseFailure {
  ok: false;
  /** One-line, human-readable reason. */
  reason: string;
}

/**
 * Some models wrap JSON in a ```json fence despite being told not to. Strip a single
 * leading/trailing fence so an otherwise-valid payload is not rejected over syntax.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/**
 * Parse and ground a diff completion. `shownItemIds` is exactly the set of item ids
 * the prompt contained (the trigger item, the vendor facts' evidence, the similar
 * priors); a citation outside it means the model invented evidence, and the whole
 * output is rejected. A non-`new` kind with no prior evidence is likewise rejected —
 * "never infer a prior state that was not supplied".
 */
export function parseDiffOutput(
  raw: string,
  context: { shownItemIds: ReadonlySet<number>; triggerItemId: number },
): DiffParseSuccess | DiffParseFailure {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${(error as Error).message}` };
  }

  const parsed = diffOutputSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message}`)
      .join('; ');
    return { ok: false, reason: `schema mismatch — ${issues}` };
  }

  const output = parsed.data;
  const unknown = output.evidence_item_ids.filter((id) => !context.shownItemIds.has(id));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `evidence_item_ids reference items not shown to the model: ${unknown.join(', ')}`,
    };
  }

  const priorEvidence = output.evidence_item_ids.filter(
    (id) => id !== context.triggerItemId,
  );
  if (output.kind !== 'new' && priorEvidence.length === 0) {
    return {
      ok: false,
      reason: `kind "${output.kind}" claims a prior state but cites no prior item`,
    };
  }

  return { ok: true, output };
}
