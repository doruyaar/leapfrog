/**
 * The live answer writer: a thin OpenRouter chat call for Ask (ADR-0003). Mirrors the
 * enrichment client — one `fetch`, provider-swappable via `OPENROUTER_CHAT_MODEL`, no
 * vendor SDK. It is optional by construction: with no key the answerer stays extractive,
 * so this is only ever constructed when a key is present.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPENROUTER_BASE_URL, MissingApiKeyError } from '../enrich/client.js';
import { IMPACT_MAX, impactLabel } from '../enrich/schema.js';
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';
import { ASK_PROMPT_VERSION, type AnswerModel, type AskContext } from './answer.js';
import type { RetrievedPassage } from './hybrid.js';

export const DEFAULT_CHAT_MODEL = 'openai/gpt-4o';

export interface ChatConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Read the chat configuration; the API key is the only hard requirement. */
export function readChatConfig(env: NodeJS.ProcessEnv = process.env): ChatConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    model: env.OPENROUTER_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
  };
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
        // keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('could not locate workspace root for prompts');
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

function loadAskPrompt(): PromptTemplate {
  if (cached) return cached;
  const raw = readFileSync(join(workspaceRoot(), 'prompts', 'ask.md'), 'utf8');
  cached = { system: section(raw, 'System'), user: section(raw, 'User') };
  return cached;
}

/**
 * Format the retrieved passages into the citation-tagged context block. Each header
 * carries LeapFrog's own assessment — the impact score (on a 1–{@link IMPACT_MAX} scale)
 * and its one-line rationale — so the model can answer questions *about the scoring*
 * from grounded values rather than guessing a scale (e.g. inventing "/10").
 */
function formatContext(passages: RetrievedPassage[]): string {
  return passages
    .map((p) => {
      const impact = `impact ${p.impactScore}/${IMPACT_MAX} — ${impactLabel(p.impactScore)}`;
      const rationale = p.rationale ? `; rationale: "${p.rationale}"` : '';
      return (
        `[#${p.rawItemId}] ${p.title} (${p.vendor ?? 'market'}, ${p.category}; ` +
        `${impact}${rationale})\n${p.content}`
      );
    })
    .join('\n\n');
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** Build an {@link AnswerModel} backed by OpenRouter's chat endpoint. */
export function createOpenRouterAnswerModel(
  config: ChatConfig = readChatConfig(),
  http: HttpOptions = {},
): AnswerModel {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: config.model,
    promptVersion: ASK_PROMPT_VERSION,
    async answer(
      query: string,
      passages: RetrievedPassage[],
      context?: AskContext,
    ): Promise<string> {
      const template = loadAskPrompt();
      // The focus note tells the model what "it" refers to; empty when unscoped.
      const focus = context ? `Focus: ${context.preamble}\n\n` : '';
      const user = template.user
        .replace('{{FOCUS}}', focus)
        .replace('{{CONTEXT}}', formatContext(passages))
        .replace('{{QUESTION}}', query);

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
            temperature: 0.2,
            messages: [
              { role: 'system', content: template.system },
              { role: 'user', content: user },
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
