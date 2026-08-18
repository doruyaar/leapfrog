/**
 * Tiny fixed-window in-memory rate limiter for the public API routes. `/api/ask` sits
 * behind Basic Auth only, and every call costs real money (OpenRouter tokens in live
 * mode) or real CPU (local embeddings key-free) — so a looped request must hit a wall.
 *
 * In-memory is a deliberate fit for the deployment shape: one Render instance, one
 * process (see render.yaml). A multi-instance deployment moves this to Redis or the
 * edge — noted in docs/DESIGN.md §6 next steps.
 */

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
/**
 * Process-wide ceiling across *all* clients in a window. The per-key limit stops a single
 * client; this stops a distributed or key-rotating flood from running up unbounded model
 * spend / CPU even when every request presents a different key. Sized well above one
 * client's budget so normal traffic never trips it.
 */
const GLOBAL_MAX_PER_WINDOW = 240;
/** Hard cap on tracked clients so a spoofed-header flood cannot grow the map forever. */
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, Window>();
/** The shared global window, kept out of `windows` so the key-sweep never resets it. */
let globalWindow: Window = { count: 0, resetAt: 0 };

/** True when `key` is still within its per-window budget; counts the request. */
export function allowRequest(
  key: string,
  max: number = MAX_PER_WINDOW,
  windowMs: number = WINDOW_MS,
): boolean {
  const now = Date.now();
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [k, w] of windows) {
        if (w.resetAt <= now) windows.delete(k);
      }
      // Still saturated after sweeping — reset rather than grow without bound.
      if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  return current.count <= max;
}

/**
 * True when the shared, all-clients budget for this window still has room; counts the
 * request. A per-key pass does not imply a global pass — call both and reject if either
 * fails, so an IP-rotating flood still hits this ceiling.
 */
export function allowGlobal(
  max: number = GLOBAL_MAX_PER_WINDOW,
  windowMs: number = WINDOW_MS,
): boolean {
  const now = Date.now();
  if (globalWindow.resetAt <= now) {
    globalWindow = { count: 1, resetAt: now + windowMs };
    return true;
  }
  globalWindow.count += 1;
  return globalWindow.count <= max;
}

/**
 * Rate-limit key for a request: the client IP as seen by the trusted proxy.
 *
 * Render (like most single-proxy setups) *appends* the real client IP as the LAST hop of
 * `X-Forwarded-For`. The leftmost hops are whatever the client sent, so keying on them
 * lets an attacker mint a fresh bucket per request (`X-Forwarded-For: <random>`) and
 * bypass the limit entirely. We trust only the proxy-appended last hop; behind a
 * different proxy topology, adjust how many trailing hops are trusted.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return 'local';
}
