import { describe, expect, it, vi } from 'vitest';
import { EMBEDDING_DIM } from '../db/constants.js';
import { DEFAULT_OPENROUTER_BASE_URL } from '../enrich/client.js';
import {
  createOpenRouterEmbedder,
  DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  EmbeddingDimensionError,
  readOpenRouterEmbeddingConfig,
  type OpenRouterEmbeddingConfig,
} from './model.js';

const CONFIG: OpenRouterEmbeddingConfig = {
  apiKey: 'test-key',
  baseUrl: DEFAULT_OPENROUTER_BASE_URL,
  model: 'openai/text-embedding-3-small',
};

/** A deterministic index-width vector with a single non-zero component. */
function basisVector(hot: number, scale = 1): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[hot] = scale;
  return vector;
}

function embeddingsResponse(vectors: number[][], shuffle = false): Response {
  const data = vectors.map((embedding, index) => ({ embedding, index }));
  if (shuffle) data.reverse();
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readOpenRouterEmbeddingConfig', () => {
  it('returns null without an API key (demo mode falls back to local)', () => {
    expect(readOpenRouterEmbeddingConfig({})).toBeNull();
    expect(readOpenRouterEmbeddingConfig({ OPENROUTER_API_KEY: '  ' })).toBeNull();
  });

  it('applies defaults for endpoint and model', () => {
    const config = readOpenRouterEmbeddingConfig({ OPENROUTER_API_KEY: 'k' });
    expect(config).toEqual({
      apiKey: 'k',
      baseUrl: DEFAULT_OPENROUTER_BASE_URL,
      model: DEFAULT_OPENROUTER_EMBEDDING_MODEL,
    });
  });

  it('reads endpoint and model overrides from env (both spellings)', () => {
    const config = readOpenRouterEmbeddingConfig({
      OPENROUTER_API_KEY: 'k',
      OPENROUTER_BASE_URL: 'https://gw.test/v9',
      OPENROUTER_EMBEDDING_MODEL: 'qwen/qwen3-embedding-8b',
    });
    expect(config?.baseUrl).toBe('https://gw.test/v9');
    expect(config?.model).toBe('qwen/qwen3-embedding-8b');

    const alias = readOpenRouterEmbeddingConfig({
      OPENROUTER_API_KEY: 'k',
      OPEN_ROUTER_EMBEDDING_MODEL: 'google/gemini-embedding-2',
    });
    expect(alias?.model).toBe('google/gemini-embedding-2');
  });
});

describe('createOpenRouterEmbedder', () => {
  it('POSTs the batch to /embeddings with auth and returns vectors in input order', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      embeddingsResponse([basisVector(0), basisVector(1)], true),
    );
    const embedder = createOpenRouterEmbedder(CONFIG, { fetch });

    const vectors = await embedder.embed(['alpha', 'beta']);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${DEFAULT_OPENROUTER_BASE_URL}/embeddings`);
    const headers = new Headers(init!.headers);
    expect(headers.get('authorization')).toBe('Bearer test-key');
    const body = JSON.parse(String(init!.body));
    expect(body).toEqual({
      model: 'openai/text-embedding-3-small',
      input: ['alpha', 'beta'],
    });

    // Response rows arrived reversed; `index` restores input order.
    expect(vectors).toHaveLength(2);
    expect(vectors[0]![0]).toBe(1);
    expect(vectors[1]![1]).toBe(1);
  });

  it('normalizes near-unit provider vectors to exact unit norm', async () => {
    const fetch = vi.fn(async () => embeddingsResponse([basisVector(3, 2)]));
    const embedder = createOpenRouterEmbedder(CONFIG, { fetch });

    const [vector] = await embedder.embed(['x']);

    expect(vector![3]).toBe(1);
    expect(Math.hypot(...vector!)).toBeCloseTo(1, 12);
  });

  it('returns an empty result for empty input without a request', async () => {
    const fetch = vi.fn(async () => embeddingsResponse([]));
    const embedder = createOpenRouterEmbedder(CONFIG, { fetch });

    expect(await embedder.embed([])).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects vectors of the wrong width instead of corrupting the index', async () => {
    const fetch = vi.fn(async () => embeddingsResponse([[0.1, 0.2, 0.3]]));
    const embedder = createOpenRouterEmbedder(CONFIG, { fetch });

    await expect(embedder.embed(['x'])).rejects.toThrow(EmbeddingDimensionError);
  });

  it('rejects a response with a vector count mismatch', async () => {
    const fetch = vi.fn(async () => embeddingsResponse([basisVector(0)]));
    const embedder = createOpenRouterEmbedder(CONFIG, { fetch });

    await expect(embedder.embed(['a', 'b'])).rejects.toThrow(/2 inputs/);
  });
});
