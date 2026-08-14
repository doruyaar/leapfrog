/**
 * URL-driven list state (search, filters, sort, pagination) shared by the list
 * surfaces. Every control is a plain query-string parameter so the state is
 * server-rendered, shareable, and survives a refresh — the same "no hidden state"
 * pattern as the category chips, generalised.
 *
 * Framework-agnostic and safe to import from both server components and client
 * components (no `server-only`, no DB access here).
 */

/** The raw shape Next.js hands a page for `searchParams` — string or repeated string. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value for a key, ignoring repeats. Empty strings collapse to `undefined`. */
export function firstValue(params: RawSearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Narrow a raw value to one of an allowed set, else `undefined`. */
export function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** A 1-based page number, clamped to at least 1. Bad input falls back to page 1. */
export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** A page of items plus the counters a pager and results summary need. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** 1-based index of the first item on this page (0 when empty). */
  from: number;
  /** 1-based index of the last item on this page (0 when empty). */
  to: number;
}

/**
 * Slice `all` into the requested page. The page is re-clamped to the real range so a
 * stale `?page=99` after narrowing a filter lands on the last page rather than an
 * empty screen.
 */
export function paginate<T>(all: T[], page: number, pageSize: number): Paginated<T> {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return {
    items,
    page: current,
    pageSize,
    total,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: start + items.length,
  };
}

/**
 * Build a query string from the current params overlaid with `overrides`. An override
 * of `undefined` (or empty string) removes the key — that's how "All" clears a filter.
 * Order is stable (sorted keys) so links are cache-friendly and diff-clean.
 */
export function buildQuery(
  current: Record<string, string | undefined>,
  overrides: Record<string, string | undefined> = {},
): string {
  const merged: Record<string, string | undefined> = { ...current, ...overrides };
  const search = new URLSearchParams();
  for (const key of Object.keys(merged).sort()) {
    const value = merged[key];
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * The page numbers to render in a pager, with `null` marking a gap ("…"). Always keeps
 * the first and last page, plus a window around the current page, so the control stays
 * a single, uncluttered row no matter how many pages there are.
 */
export function pageWindow(current: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current]);
  for (const delta of [-1, 1]) {
    const p = current + delta;
    if (p > 1 && p < total) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) out.push(null);
    out.push(page);
    previous = page;
  }
  return out;
}
