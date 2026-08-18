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
/** Hard cap on tracked clients so a spoofed-header flood cannot grow the map forever. */
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, Window>();

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

/** Rate-limit key for a request: the first hop of X-Forwarded-For (set by Render's proxy). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'local';
}
