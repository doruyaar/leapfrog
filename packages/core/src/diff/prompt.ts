/**
 * The diff prompt is a versioned, code-reviewed asset like `enrich.md` (ADR-0003):
 * `prompts/diff.md` holds `## System` / `## User` templates, and every stored change
 * event is stamped with `DIFF_PROMPT_VERSION` so a classification is traceable to the
 * exact wording that produced it. Groundedness first: the model is shown the vendor's
 * current facts and the retrieved similar priors — it compares, it never recalls.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGE_KINDS, DIMENSIONS } from '../db/schema.js';
import type { ChatMessage } from '../enrich/prompt.js';
import type { VendorFact } from '../db/schema.js';
import type { DiffInput } from './select.js';

/** Bump on any change to `prompts/diff.md`; stored with each change event. */
export const DIFF_PROMPT_VERSION = 'diff@1';

/** Stamped on rows the deterministic (key-free) path produced. */
export const DIFF_DETERMINISTIC_VERSION = 'diff-deterministic@1';
export const DETERMINISTIC_MODEL = 'deterministic';

/** A prior item retrieved as similar to the trigger — context, never recall. */
export interface SimilarPrior {
  rawItemId: number;
  title: string;
  summary: string;
  publishedAt: Date | null;
  /** Cosine similarity to the trigger item. */
  similarity: number;
}

/** Everything the diff prompt gets to see for one item. */
export interface DiffPromptContext {
  input: DiffInput;
  facts: VendorFact[];
  similarPriors: SimilarPrior[];
}

interface PromptTemplate {
  system: string;
  user: string;
}

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
      throw new Error('could not locate the workspace root to load prompts from');
    }
    dir = parent;
  }
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const from = markdown.indexOf('\n', start) + 1;
  const next = markdown.indexOf('\n## ', from);
  return markdown.slice(from, next === -1 ? undefined : next).trim();
}

let cached: PromptTemplate | undefined;

/** Load and split `prompts/diff.md` into its system and user templates (cached). */
export function loadDiffPromptTemplate(): PromptTemplate {
  if (cached) return cached;

  const path = join(workspaceRoot(), 'prompts', 'diff.md');
  const raw = readFileSync(path, 'utf8');
  const system = section(raw, 'System');
  const user = section(raw, 'User');
  if (!system || !user) {
    throw new Error(`${path} is missing a "## System" or "## User" section`);
  }

  cached = { system, user };
  return cached;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

function formatFacts(facts: VendorFact[]): string {
  if (facts.length === 0) return '(no recorded facts for this vendor yet)';
  return facts
    .map(
      (f) =>
        `- [#${f.evidenceItemId}] (${f.dimension}, since ${f.validFrom.toISOString().slice(0, 10)}) ${f.fact}`,
    )
    .join('\n');
}

function formatPriors(priors: SimilarPrior[]): string {
  if (priors.length === 0) return '(no similar prior items found)';
  return priors
    .map(
      (p) =>
        `- [#${p.rawItemId}] (similarity ${p.similarity.toFixed(2)}, ` +
        `${p.publishedAt?.toISOString().slice(0, 10) ?? 'undated'}) ${p.title} — ${p.summary}`,
    )
    .join('\n');
}

/** Render the chat messages for one diff classification. */
export function buildDiffMessages(context: DiffPromptContext): ChatMessage[] {
  const template = loadDiffPromptTemplate();
  const { input } = context;
  const shared = {
    KINDS: CHANGE_KINDS.join(', '),
    DIMENSIONS: DIMENSIONS.join(', '),
  };

  return [
    { role: 'system', content: fill(template.system, shared) },
    {
      role: 'user',
      content: fill(template.user, {
        ...shared,
        VENDOR: input.vendor ?? 'unknown',
        ITEM_ID: String(input.rawItemId),
        PUBLISHED_AT: input.publishedAt?.toISOString() ?? 'unknown',
        TITLE: input.title,
        SUMMARY: input.summary,
        CONTENT: input.content,
        FACTS: formatFacts(context.facts),
        SIMILAR_ITEMS: formatPriors(context.similarPriors),
      }),
    },
  ];
}

/** Every item id the prompt exposes — the only ids a valid completion may cite. */
export function shownItemIds(context: DiffPromptContext): Set<number> {
  return new Set([
    context.input.rawItemId,
    ...context.facts.map((f) => f.evidenceItemId),
    ...context.similarPriors.map((p) => p.rawItemId),
  ]);
}
