/**
 * Live drafting of matrix edits (`matrix-edit@1`, GAP-PLAN §5.2). Optional by
 * construction: the deterministic draft on every suggestion is already valid, and a
 * model may only *replace* it with a concise rewritten note that passes zod and
 * cites the driving signal. Any failure keeps the deterministic draft — the
 * approval loop never depends on a key.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  DEFAULT_ENRICH_MODEL,
  DEFAULT_OPENROUTER_BASE_URL,
  MissingApiKeyError,
  type OpenRouterConfig,
} from '../enrich/client.js';
import { extractCitations } from '../brief/compose.js';
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';
import { CELL_LEVELS, type MatrixCell, type MatrixSuggestion } from './matrix.js';

/** Bump on any change to `prompts/matrix-edit.md`. */
export const MATRIX_EDIT_PROMPT_VERSION = 'matrix-edit@1';

/** Read the drafting-model configuration; absent key means deterministic drafts. */
export function readMatrixEditModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    model:
      env.OPENROUTER_MATRIX_EDIT_MODEL?.trim() ||
      env.OPENROUTER_ENRICH_MODEL?.trim() ||
      DEFAULT_ENRICH_MODEL,
  };
}

const draftOutputSchema = z
  .object({
    level: z.enum(CELL_LEVELS),
    note: z.string().min(1),
  })
  .strip();

/** A source of drafted cell edits; live OpenRouter in production, a stub in tests. */
export interface MatrixEditDrafter {
  readonly model: string;
  readonly promptVersion: string;
  /** Returns a replacement cell, or throws — the caller always has a fallback. */
  draft(suggestion: MatrixSuggestion): Promise<string>;
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

function loadMatrixEditPrompt(): PromptTemplate {
  if (cached) return cached;
  const path = join(workspaceRoot(), 'prompts', 'matrix-edit.md');
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

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** Build a {@link MatrixEditDrafter} backed by OpenRouter. */
export function createOpenRouterMatrixDrafter(
  config: OpenRouterConfig,
  http: HttpOptions = {},
): MatrixEditDrafter {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: config.model,
    promptVersion: MATRIX_EDIT_PROMPT_VERSION,
    async draft(suggestion: MatrixSuggestion): Promise<string> {
      const template = loadMatrixEditPrompt();
      const values = {
        LEVELS: CELL_LEVELS.join(', '),
        VENDOR: suggestion.vendor,
        AXIS: suggestion.axisLabel,
        CURRENT_LEVEL: suggestion.currentLevel,
        CURRENT_NOTE: suggestion.currentNote,
        SIGNAL_ID: String(suggestion.signalId),
        SIGNAL_TITLE: suggestion.signalTitle,
        SIGNAL_SUMMARY: suggestion.signalSummary,
      };

      const response = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: fill(template.system, values) },
              { role: 'user', content: fill(template.user, values) },
            ],
          }),
        },
        { timeoutMs: 60_000, ...http },
      );

      const payload = (await response.json()) as ChatCompletionResponse;
      return payload.choices?.[0]?.message?.content ?? '';
    },
  };
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/**
 * Validate a drafted completion against the suggestion it was drafted for: zod
 * shape, and every `[#id]` citation must resolve to the driving signal. Returns
 * `null` on any failure so the caller keeps the deterministic draft.
 */
export function parseDraftedEdit(
  raw: string,
  suggestion: MatrixSuggestion,
): MatrixCell | null {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }

  const parsed = draftOutputSchema.safeParse(json);
  if (!parsed.success) return null;

  const citations = extractCitations(parsed.data.note);
  const grounded =
    citations.length > 0 && citations.every((id) => id === suggestion.signalId);
  if (!grounded) return null;

  return parsed.data;
}

/**
 * Upgrade suggestions with live-drafted notes where possible. Every failure —
 * transport, schema, citation — silently keeps that suggestion's deterministic
 * draft. Runs the drafts concurrently; order is preserved.
 */
export async function draftMatrixEdits(
  drafter: MatrixEditDrafter,
  suggestions: MatrixSuggestion[],
): Promise<MatrixSuggestion[]> {
  return Promise.all(
    suggestions.map(async (suggestion) => {
      try {
        const drafted = parseDraftedEdit(await drafter.draft(suggestion), suggestion);
        return drafted ? { ...suggestion, proposed: drafted } : suggestion;
      } catch {
        return suggestion;
      }
    }),
  );
}
