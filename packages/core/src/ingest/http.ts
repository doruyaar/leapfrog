/**
 * HTTP fetching for source adapters: per-request timeout, bounded retries with
 * jittered exponential backoff, and `Retry-After` support.
 *
 * Feeds and public APIs are the flakiest part of the pipeline (docs/DESIGN.md §7),
 * so every adapter goes through this one entry point. `fetch`, `sleep`, and
 * `random` are injectable so retry behaviour is unit-testable without real
 * network calls or real waiting.
 */

/** Statuses worth retrying: rate limits and transient server-side failures. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const USER_AGENT = 'LeapFrog-CI/0.1 (+https://github.com/doruyaar/leapfrog)';

export interface RetryPolicy {
  /** Total attempts including the first one. */
  attempts: number;
  /** First backoff step; doubles per attempt. */
  baseDelayMs: number;
  /** Upper bound for any single wait, including `Retry-After`. */
  maxDelayMs: number;
  /** Abort a single attempt after this long. */
  timeoutMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  timeoutMs: 15_000,
};

/** Injectable environment, overridden in tests. */
export interface HttpDeps {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export type HttpOptions = Partial<RetryPolicy> & Partial<HttpDeps>;

export const DEFAULT_HTTP_DEPS: HttpDeps = {
  fetch: (...args) => globalThis.fetch(...args),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/** A response the adapter cannot use: non-2xx after retries, or a transport failure. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function resolve(options: HttpOptions): RetryPolicy & HttpDeps {
  return { ...DEFAULT_RETRY_POLICY, ...DEFAULT_HTTP_DEPS, ...options };
}

/**
 * `Retry-After` in delta-seconds or HTTP-date form. Returns `undefined` when the
 * header is absent or unparseable, in which case the caller falls back to backoff.
 */
export function parseRetryAfter(
  header: string | null,
  now = Date.now(),
): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Full-jitter exponential backoff: random point in `[0, base * 2^attempt]`. */
function backoffMs(attempt: number, policy: RetryPolicy, random: () => number): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.round(random() * ceiling);
}

function timeoutSignal(timeoutMs: number, caller?: AbortSignal | null): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

/**
 * Fetch a URL, retrying transient failures. Resolves only with a 2xx response;
 * anything else (including a retryable status whose attempts ran out) throws
 * `HttpError` so a single bad source cannot silently produce an empty run.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<Response> {
  const { attempts, baseDelayMs, maxDelayMs, timeoutMs, fetch, sleep, random } =
    resolve(options);
  const policy = { attempts, baseDelayMs, maxDelayMs, timeoutMs };
  const headers = new Headers(init.headers);
  if (!headers.has('user-agent')) headers.set('user-agent', USER_AGENT);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const isLast = attempt === attempts - 1;
    let waitMs: number;

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: timeoutSignal(timeoutMs, init.signal),
      });

      if (response.ok) return response;

      const failure = new HttpError(
        `GET ${url} failed with HTTP ${response.status}`,
        url,
        response.status,
      );
      if (isLast || !RETRYABLE_STATUSES.has(response.status)) throw failure;

      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      waitMs = Math.min(retryAfter ?? backoffMs(attempt, policy, random), maxDelayMs);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Transport-level failure (DNS, socket, timeout) — always worth another try.
      if (isLast) {
        throw new HttpError(
          `GET ${url} failed: ${describe(error)}`,
          url,
          undefined,
          error,
        );
      }
      waitMs = backoffMs(attempt, policy, random);
    }

    await sleep(waitMs);
  }

  // Unreachable: the final attempt either returns a 2xx response or throws.
  throw new HttpError(`GET ${url} failed`, url);
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<string> {
  const response = await fetchWithRetry(url, init, options);
  return response.text();
}

export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  options: HttpOptions = {},
): Promise<T> {
  const response = await fetchWithRetry(
    url,
    { ...init, headers: { accept: 'application/json', ...init.headers } },
    options,
  );

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new HttpError(`GET ${url} returned invalid JSON`, url, response.status, error);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
