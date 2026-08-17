/**
 * The contract between the LLM and the store. Enrichment output is never trusted:
 * the model returns JSON, this schema validates it, and anything that fails is
 * quarantined rather than shown (ADR-0003, docs/DESIGN.md §5). Field names here are
 * the snake_case the prompt asks the model for; `toEnrichmentFields` maps them onto
 * the camelCase `enriched_items` columns.
 */
import { z } from 'zod';
import { CATEGORIES } from '../db/schema.js';

/** Top of the impact scale. Impact is an integer 1–{@link IMPACT_MAX}, never `/10`. */
export const IMPACT_MAX = 5;

/** The rubric label for an impact score (mirrors `prompts/enrich.md`). */
export function impactLabel(score: number): string {
  return (
    ({ 5: 'Act now', 4: 'High', 3: 'Medium', 2: 'Low', 1: 'Noise' } as Record<
      number,
      string
    >)[score] ?? 'Unscored'
  );
}

/**
 * The JSON shape the enrichment prompt asks for. `.strip()` tolerates extra keys a
 * model may add; the required fields still have to be present and well-typed.
 */
export const enrichmentOutputSchema = z
  .object({
    category: z.enum(CATEGORIES),
    vendors: z.array(z.string().min(1)).default([]),
    products: z.array(z.string().min(1)).default([]),
    impact_score: z.number().int().min(1).max(5),
    summary: z.string().min(1),
    why_it_matters: z.string().min(1),
    rationale: z.string().min(1).optional(),
  })
  .strip();

export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;

/** The validated, column-shaped subset of an enrichment ready to persist. */
export interface EnrichmentFields {
  category: EnrichmentOutput['category'];
  vendors: string;
  products: string;
  impactScore: number;
  summary: string;
  whyItMatters: string;
  rationale: string | null;
}

export interface ParseSuccess {
  ok: true;
  fields: EnrichmentFields;
}

export interface ParseFailure {
  ok: false;
  /** One-line, human-readable reason, stored in `quarantine_reason`. */
  reason: string;
}

/**
 * Parse a model's raw text into validated enrichment fields. Handles the two ways a
 * model breaks the contract — unparseable JSON and JSON of the wrong shape — and
 * returns a single-line reason in both cases so the caller can quarantine uniformly.
 */
export function parseEnrichmentOutput(raw: string): ParseSuccess | ParseFailure {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${(error as Error).message}` };
  }

  const parsed = enrichmentOutputSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message}`)
      .join('; ');
    return { ok: false, reason: `schema mismatch — ${issues}` };
  }

  return { ok: true, fields: toEnrichmentFields(parsed.data) };
}

/** Map validated output onto the `enriched_items` column shape (JSON arrays as text). */
export function toEnrichmentFields(output: EnrichmentOutput): EnrichmentFields {
  return {
    category: output.category,
    vendors: JSON.stringify(output.vendors),
    products: JSON.stringify(output.products),
    impactScore: output.impact_score,
    summary: output.summary,
    whyItMatters: output.why_it_matters,
    rationale: output.rationale ?? null,
  };
}

/**
 * Some models wrap JSON in a ```json fence despite being told not to. Strip a single
 * leading/trailing fence so an otherwise-valid payload is not quarantined over syntax.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}
