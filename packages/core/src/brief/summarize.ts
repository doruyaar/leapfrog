/**
 * The optional live writer for the brief's executive summary (docs/DESIGN.md §5, step 5).
 *
 * Like every other generation boundary, this is a thin OpenAI-compatible call to
 * OpenRouter behind an interface ({@link BriefSummarizer}), so the composer depends on
 * the contract, not the network, and demo mode omits it entirely. The model is config
 * (`OPENROUTER_BRIEF_MODEL`); the prompt is the code-reviewed asset `prompts/brief.md`.
 *
 * LLM output is never trusted here either: this module only parses the JSON into a typed
 * {@link BriefDraft}. Whether the draft may ship is decided by `composeBrief`, which
 * checks that every citation resolves, every quote is verbatim, and every conflict names
 * at least two sources — falling back to the deterministic extractive summary otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';
import { MissingApiKeyError, type OpenRouterConfig } from '../enrich/client.js';
import type { BriefDraft, BriefSource, BriefSummarizer } from './compose.js';

/** Bump on any change to `prompts/brief.md`; stored with each live-composed brief. */
export const BRIEF_LLM_PROMPT_VERSION = 'brief-llm@1';

/** Default model when neither the brief nor the shared chat model is configured. */
export const DEFAULT_BRIEF_MODEL = 'openai/gpt-4o-mini';

/** How much of each source body to show the model, bounding prompt size. */
const MAX_SOURCE_CHARS = 1200;

const claimSchema = z
  .object({
    text: z.string().min(1),
    sourceId: z.number().int(),
    quote: z.string().min(1),
  })
  .strip();

/** The JSON shape `prompts/brief.md` asks the model for. */
export const briefDraftSchema = z
  .object({
    summary: z.string().min(1),
    claims: z.array(claimSchema).default([]),
    conflicts: z
      .array(
        z
          .object({
            topic: z.string().min(1),
            sides: z.array(claimSchema).min(2),
            note: z.string().min(1),
          })
          .strip(),
      )
      .default([]),
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

/**
 * Parse a completion into a typed draft. Throws on invalid JSON or a schema mismatch so
 * the composer's fallback engages — an unparseable summary must never reach the reader.
 */
export function parseBriefDraft(raw: string): BriefDraft {
  const json = JSON.parse(stripCodeFence(raw)) as unknown;
  const parsed = briefDraftSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message}`)
      .join('; ');
    throw new Error(`brief draft schema mismatch — ${issues}`);
  }
  return parsed.data;
}

/**
 * Read the brief summarizer configuration. The model is config with a sensible default
 * (`OPENROUTER_BRIEF_MODEL`, falling back to the shared chat model); the API key is the
 * only hard requirement, and its absence is the typed error the worker turns into a
 * friendly "demo mode" message.
 */
export function readBriefModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    model:
      env.OPENROUTER_BRIEF_MODEL?.trim() ||
      env.OPENROUTER_CHAT_MODEL?.trim() ||
      DEFAULT_BRIEF_MODEL,
  };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
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

/** Load the `## System` body of `prompts/brief.md` (cached). */
function loadBriefSystemPrompt(): string {
  if (cachedSystem) return cachedSystem;
  const raw = readFileSync(join(workspaceRoot(), 'prompts', 'brief.md'), 'utf8');
  const start = raw.indexOf('## System');
  const from = raw.indexOf('\n', start) + 1;
  const next = raw.indexOf('\n## ', from);
  const body = raw.slice(from, next === -1 ? undefined : next).trim();
  if (start === -1 || !body) {
    throw new Error('prompts/brief.md is missing a "## System" section');
  }
  cachedSystem = body;
  return cachedSystem;
}

/** Render the tagged, quotable insight block the prompt's `{{INSIGHTS}}` slot expects. */
export function buildInsightsBlock(sources: BriefSource[]): string {
  return sources
    .map((source) => {
      const vendor = source.vendor ? ` (${source.vendor})` : '';
      const body = source.content.replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE_CHARS);
      return (
        `[#${source.id}] ${source.title}${vendor} — impact ${source.impactScore}\n` +
        `${source.summary}\n` +
        `Source text: ${body}`
      );
    })
    .join('\n\n');
}

/**
 * Build a {@link BriefSummarizer} backed by OpenRouter. `http` overrides (injected
 * `fetch`, timeouts) flow through to the shared retrying client, keeping the summarizer
 * unit-testable without the network.
 */
export function createOpenRouterBriefSummarizer(
  config: OpenRouterConfig,
  http: HttpOptions = {},
): BriefSummarizer {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: config.model,
    promptVersion: BRIEF_LLM_PROMPT_VERSION,
    async summarize(sources: BriefSource[]): Promise<BriefDraft> {
      const messages = [
        { role: 'system', content: loadBriefSystemPrompt() },
        { role: 'user', content: `Insights:\n${buildInsightsBlock(sources)}` },
      ];

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
            messages,
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        },
        { timeoutMs: 60_000, ...http },
      );

      const payload = (await response.json()) as ChatCompletionResponse;
      return parseBriefDraft(payload.choices?.[0]?.message?.content ?? '');
    },
  };
}
