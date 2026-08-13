/**
 * The generation boundary: a thin OpenAI-compatible client for OpenRouter (ADR-0003).
 * No vendor SDK — one `fetch` to `/chat/completions` keeps the provider swappable to
 * anything OpenRouter fronts via a single env change. Every call is timed and its
 * `request_id` and token usage returned, so the pipeline can log observability onto
 * each enriched row (docs/DESIGN.md §5).
 */
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';
import { buildEnrichMessages, type ChatMessage, type PromptInput } from './prompt.js';

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  /** Model slug, e.g. `openai/gpt-4o-mini`. */
  model: string;
  focusVendor?: string;
}

export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_ENRICH_MODEL = 'openai/gpt-4o-mini';

/** Raised when live enrichment is requested without the one required secret. */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'OPENROUTER_API_KEY is not set. Enrichment needs it in live mode; demo mode ' +
        'runs on committed seed data instead (npm run seed).',
    );
    this.name = 'MissingApiKeyError';
  }
}

/**
 * Read the OpenRouter configuration from the environment. Endpoint and model are
 * config with sensible defaults; the API key is the only hard requirement, and its
 * absence is a typed error the worker turns into a friendly message.
 */
export function readOpenRouterConfig(
  env: NodeJS.ProcessEnv = process.env,
): OpenRouterConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();

  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    model: env.OPENROUTER_ENRICH_MODEL?.trim() || DEFAULT_ENRICH_MODEL,
  };
}

/** What a single completion returns, before validation: raw text plus observability. */
export interface ModelCompletion {
  content: string;
  requestId: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * A source of enrichment completions. The pipeline depends on this interface, not on
 * OpenRouter, so tests inject a deterministic stub and never touch the network.
 */
export interface EnrichmentModel {
  readonly model: string;
  complete(input: PromptInput): Promise<ModelCompletion>;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Build an {@link EnrichmentModel} backed by OpenRouter. `http` overrides (injected
 * `fetch`, timeouts) flow straight through to the shared retrying client, which is how
 * the client stays unit-testable. LLM calls are slower than feeds, so the per-attempt
 * timeout is raised well above the ingest default.
 */
export function createOpenRouterModel(
  config: OpenRouterConfig,
  http: HttpOptions = {},
): EnrichmentModel {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: config.model,
    async complete(input: PromptInput): Promise<ModelCompletion> {
      const messages: ChatMessage[] = buildEnrichMessages(input, config.focusVendor);
      const startedAt = Date.now();

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

      const latencyMs = Date.now() - startedAt;
      const payload = (await response.json()) as ChatCompletionResponse;

      return {
        content: payload.choices?.[0]?.message?.content ?? '',
        requestId: payload.id ?? null,
        latencyMs,
        promptTokens: payload.usage?.prompt_tokens ?? null,
        completionTokens: payload.usage?.completion_tokens ?? null,
      };
    },
  };
}
