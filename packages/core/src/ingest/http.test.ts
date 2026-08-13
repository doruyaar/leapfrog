import { describe, expect, it, vi } from 'vitest';
import {
  fetchJson,
  fetchWithRetry,
  HttpError,
  parseRetryAfter,
  USER_AGENT,
} from './http.js';

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

/** Retry tests inject `sleep`/`random` so they assert waits without spending them. */
function deps() {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    random: () => 1,
  };
}

describe('parseRetryAfter', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-08-13T12:00:00Z');
    expect(parseRetryAfter('Thu, 13 Aug 2026 12:00:30 GMT', now)).toBe(30_000);
  });

  it('ignores a missing or unparseable header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

describe('fetchWithRetry', () => {
  it('returns the first successful response and identifies the client', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      response('ok'),
    );

    const result = await fetchWithRetry('https://example.test/feed', {}, { fetch });

    expect(await result.text()).toBe('ok');
    expect(fetch).toHaveBeenCalledOnce();
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.get('user-agent')).toBe(USER_AGENT);
  });

  it('retries a 503 and succeeds on a later attempt', async () => {
    const { sleep, random, sleeps } = deps();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response('down', { status: 503 }))
      .mockResolvedValueOnce(response('up'));

    const result = await fetchWithRetry(
      'https://example.test/feed',
      {},
      { fetch, sleep, random },
    );

    expect(await result.text()).toBe('up');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([500]);
  });

  it('honours Retry-After on a 429, capped by maxDelayMs', async () => {
    const { sleep, random, sleeps } = deps();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response('slow down', { status: 429, headers: { 'retry-after': '600' } }),
      )
      .mockResolvedValueOnce(response('ok'));

    await fetchWithRetry(
      'https://example.test/api',
      {},
      { fetch, sleep, random, maxDelayMs: 4000 },
    );

    expect(sleeps).toEqual([4000]);
  });

  it('does not retry a 404', async () => {
    const { sleep, random } = deps();
    const fetch = vi.fn(async () => response('missing', { status: 404 }));

    await expect(
      fetchWithRetry('https://example.test/gone', {}, { fetch, sleep, random }),
    ).rejects.toMatchObject({ name: 'HttpError', status: 404 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retries transport failures and gives up after the attempt budget', async () => {
    const { sleep, random, sleeps } = deps();
    const fetch = vi.fn(async () => {
      throw new TypeError('socket hang up');
    });

    await expect(
      fetchWithRetry(
        'https://example.test/feed',
        {},
        { fetch, sleep, random, attempts: 3 },
      ),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });
});

describe('fetchJson', () => {
  it('surfaces malformed JSON as an HttpError', async () => {
    const fetch = vi.fn(async () => response('<html>maintenance</html>'));

    await expect(fetchJson('https://example.test/api', {}, { fetch })).rejects.toThrow(
      /invalid JSON/,
    );
  });
});
