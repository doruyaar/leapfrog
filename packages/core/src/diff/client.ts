/**
 * The diff generation boundary: the same thin OpenAI-compatible OpenRouter call the
 * enrichment stage uses — one `fetch`, no vendor SDK, provider swappable by env. The
 * stage depends on the {@link DiffModel} interface, so tests inject a deterministic
 * stub and never touch the network.
 */
import { fetchWithRetry, type HttpOptions } from '../ingest/http.js';
import type { ModelCompletion, OpenRouterConfig } from '../enrich/client.js';
import { buildDiffMessages, type DiffPromptContext } from './prompt.js';

/** A source of diff completions — live OpenRouter in production, a stub in tests. */
export interface DiffModel {
  readonly model: string;
  complete(context: DiffPromptContext): Promise<ModelCompletion>;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Build a {@link DiffModel} backed by OpenRouter. */
export function createOpenRouterDiffModel(
  config: OpenRouterConfig,
  http: HttpOptions = {},
): DiffModel {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    model: config.model,
    async complete(context: DiffPromptContext): Promise<ModelCompletion> {
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
            messages: buildDiffMessages(context),
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
