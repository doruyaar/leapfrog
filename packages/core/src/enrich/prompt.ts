/**
 * The enrichment prompt is a versioned, code-reviewed asset (ADR-0003): the model is
 * config, the wording is not. `prompts/enrich.md` holds a `## System` and a `## User`
 * section with `{{PLACEHOLDER}}` slots; this module loads it once and fills the slots
 * per item. `ENRICH_PROMPT_VERSION` is stamped onto every stored row so an enrichment
 * is always traceable to the exact prompt that produced it — bump it when the file
 * changes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../db/schema.js';

/** Bump on any change to `prompts/enrich.md`; stored with each enriched row. */
export const ENRICH_PROMPT_VERSION = 'enrich@1';

/** The vendor the product defends, injected into the prompt. Product config, not code. */
export const DEFAULT_FOCUS_VENDOR = 'JFrog';

export interface PromptTemplate {
  system: string;
  user: string;
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** Fields a raw item contributes to the prompt. Vendor/source come from the join. */
export interface PromptInput {
  title: string;
  content: string;
  url: string;
  vendor: string | null;
  sourceName: string;
  publishedAt: Date | null;
}

/**
 * Walk up from this module to the monorepo root (the package.json that declares
 * `workspaces`), so the prompt resolves the same whether we run from `dist/`, from
 * `tsx`, or under vitest — independent of the process's working directory.
 */
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

let cached: PromptTemplate | undefined;

/** Load and split `prompts/enrich.md` into its system and user templates (cached). */
export function loadEnrichPromptTemplate(): PromptTemplate {
  if (cached) return cached;

  const path = join(workspaceRoot(), 'prompts', 'enrich.md');
  const raw = readFileSync(path, 'utf8');
  const system = section(raw, 'System');
  const user = section(raw, 'User');

  if (!system || !user) {
    throw new Error(`${path} is missing a "## System" or "## User" section`);
  }

  cached = { system, user };
  return cached;
}

/** Extract the body of a `## <heading>` section, up to the next `## ` or end of file. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start === -1) return '';

  const from = markdown.indexOf('\n', start) + 1;
  const next = markdown.indexOf('\n## ', from);
  const body = markdown.slice(from, next === -1 ? undefined : next);
  return body.trim();
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

/**
 * Render the chat messages for one item. The focus vendor and category list are
 * substituted into the system prompt so the enum the model must return always matches
 * the schema it is validated against.
 */
export function buildEnrichMessages(
  input: PromptInput,
  focusVendor: string = DEFAULT_FOCUS_VENDOR,
): ChatMessage[] {
  const template = loadEnrichPromptTemplate();
  const shared = { FOCUS_VENDOR: focusVendor, CATEGORIES: CATEGORIES.join(', ') };

  return [
    { role: 'system', content: fill(template.system, shared) },
    {
      role: 'user',
      content: fill(template.user, {
        ...shared,
        SOURCE_NAME: input.sourceName,
        VENDOR: input.vendor ?? 'unknown',
        PUBLISHED_AT: input.publishedAt?.toISOString() ?? 'unknown',
        URL: input.url,
        TITLE: input.title,
        CONTENT: input.content,
      }),
    },
  ];
}
