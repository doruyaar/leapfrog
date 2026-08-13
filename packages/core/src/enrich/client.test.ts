import { describe, expect, it, vi } from 'vitest';
import {
  createOpenRouterModel,
  DEFAULT_ENRICH_MODEL,
  DEFAULT_OPENROUTER_BASE_URL,
  MissingApiKeyError,
  readOpenRouterConfig,
  type OpenRouterConfig,
} from './client.js';
import type { PromptInput } from './prompt.js';

const CONFIG: OpenRouterConfig = {
  apiKey: 'test-key',
  baseUrl: DEFAULT_OPENROUTER_BASE_URL,
  model: 'openai/gpt-4o-mini',
};

const INPUT: PromptInput = {
  title: 'Title',
  content: 'Body',
  url: 'https://example.test/x',
  vendor: 'JFrog',
  sourceName: 'Blog',
  publishedAt: new Date('2026-08-13T00:00:00Z'),
};

function completion() {
  return new Response(
    JSON.stringify({
      id: 'req-123',
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 300, completion_tokens: 40 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('readOpenRouterConfig', () => {
  it('requires an API key', () => {
    expect(() => readOpenRouterConfig({})).toThrow(MissingApiKeyError);
  });

  it('applies defaults for endpoint and model', () => {
    const config = readOpenRouterConfig({ OPENROUTER_API_KEY: 'k' });
    expect(config.baseUrl).toBe(DEFAULT_OPENROUTER_BASE_URL);
    expect(config.model).toBe(DEFAULT_ENRICH_MODEL);
  });

  it('reads endpoint and model overrides from env', () => {
    const config = readOpenRouterConfig({
      OPENROUTER_API_KEY: 'k',
      OPENROUTER_BASE_URL: 'https://gw.test/v9',
      OPENROUTER_ENRICH_MODEL: 'meta-llama/llama-3.1',
    });
    expect(config.baseUrl).toBe('https://gw.test/v9');
    expect(config.model).toBe('meta-llama/llama-3.1');
  });
});

describe('createOpenRouterModel', () => {
  it('POSTs a structured-output chat request with auth', async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => completion(),
    );
    const model = createOpenRouterModel(CONFIG, { fetch });

    await model.complete(INPUT);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${DEFAULT_OPENROUTER_BASE_URL}/chat/completions`);

    const headers = new Headers(init!.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');

    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('Title');
  });

  it('returns the content and observability from the response', async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => completion(),
    );
    const model = createOpenRouterModel(CONFIG, { fetch });

    const result = await model.complete(INPUT);

    expect(result.content).toBe('{"ok":true}');
    expect(result.requestId).toBe('req-123');
    expect(result.promptTokens).toBe(300);
    expect(result.completionTokens).toBe(40);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
