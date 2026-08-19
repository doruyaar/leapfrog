/**
 * The live contradiction judge: an optional LLM second opinion on whether two statements
 * make opposing claims (docs/PITFALLS.md §1). The deterministic measures in
 * `contradiction.ts` are precise but lexical; a paraphrased contradiction slips past
 * them. In live mode this judge — the same chat model as Ask (`OPENROUTER_CHAT_MODEL`) —
 * decides instead.
 *
 * LLM output is never trusted (ADR-0003): the verdict must parse into the zod schema,
 * and a `contradict` verdict must quote a **verbatim** span from each statement as
 * evidence. Anything else throws, and `decideContradiction` falls back to the
 * deterministic measures. The prompt is the versioned asset `prompts/conflict.md`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';
import type { OpenRouterConfig } from '../enrich/client.js';
import type { ContradictionJudge, ContradictionResult } from './contradiction.js';

/** Bump on any change to `prompts/conflict.md`. */
export const CONFLICT_PROMPT_VERSION = 'conflict@1';

/** The JSON shape `prompts/conflict.md` asks the model for. */
export const conflictVerdictSchema = z
  .object({
    verdict: z.enum(['contradict', 'consistent']),
    evidenceA: z.string().optional(),
    evidenceB: z.string().optional(),
  })
  .strip();

/** Some models wrap JSON in a ```json fence despite instructions; strip one if present. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The shortest evidence span we accept; anything shorter cannot identify a claim. */
const MIN_EVIDENCE_CHARS = 3;

/** True when `span` is a non-trivial verbatim excerpt of `statement`. */
function evidenceIsGrounded(span: string | undefined, statement: string): span is string {
  if (!span) return false;
  const needle = normalizeForMatch(span);
  if (needle.length < MIN_EVIDENCE_CHARS) return false;
  return normalizeForMatch(statement).includes(needle);
}

/**
 * Parse a completion into a validated verdict. A `contradict` verdict is only accepted
 * when both evidence spans are verbatim excerpts of their statements; otherwise this
 * throws so the caller falls back to the deterministic measures.
 */
export function parseConflictVerdict(
  raw: string,
  a: string,
  b: string,
): ContradictionResult {
  const json = JSON.parse(stripCodeFence(raw)) as unknown;
  const parsed = conflictVerdictSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('conflict verdict schema mismatch');
  }

  if (parsed.data.verdict === 'consistent') {
    return { contradicts: false, signals: [] };
  }

  const { evidenceA, evidenceB } = parsed.data;
  if (!evidenceIsGrounded(evidenceA, a) || !evidenceIsGrounded(evidenceB, b)) {
    throw new Error('conflict verdict evidence is not verbatim in the statements');
  }
  return {
    contradicts: true,
    signals: [`"${evidenceA.trim()}" vs "${evidenceB.trim()}"`],
  };
}

/** Walk up to the monorepo root so the prompt resolves regardless of cwd. */
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

let cachedSystem: string | undefined;

/** Load the `## System` body of `prompts/conflict.md` (cached). */
function loadConflictSystemPrompt(): string {
  if (cachedSystem) return cachedSystem;
  const raw = readFileSync(join(workspaceRoot(), 'prompts', 'conflict.md'), 'utf8');
  const start = raw.indexOf('## System');
  const from = raw.indexOf('\n', start) + 1;
  const next = raw.indexOf('\n## ', from);
  const body = raw.slice(from, next === -1 ? undefined : next).trim();
  if (start === -1 || !body) {
    throw new Error('prompts/conflict.md is missing a "## System" section');
  }
  cachedSystem = body;
  return cachedSystem;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Build a {@link ContradictionJudge} backed by OpenRouter. Pass the chat configuration
 * (`readChatConfig()`) so the judge runs on the same model as Ask; `http` overrides keep
 * it unit-testable without the network.
 */
export function createOpenRouterConflictJudge(
  config: OpenRouterConfig,
  http: HttpOptions = {},
): ContradictionJudge {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: config.model,
    promptVersion: CONFLICT_PROMPT_VERSION,
    async judge(a: string, b: string): Promise<ContradictionResult> {
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
              { role: 'system', content: loadConflictSystemPrompt() },
              { role: 'user', content: `Statement A: ${a}\nStatement B: ${b}` },
            ],
          }),
        },
        { timeoutMs: 30_000, ...http },
      );

      const payload = (await response.json()) as ChatCompletionResponse;
      return parseConflictVerdict(payload.choices?.[0]?.message?.content ?? '', a, b);
    },
  };
}
