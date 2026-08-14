'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, Search, X } from 'lucide-react';
import { buildQuery } from '@/lib/list-params';
import { cn } from '@/lib/utils';

/** A labelled dropdown filter bound to one query-string parameter. */
export interface SelectFilter {
  /** The query-string key this filter drives, e.g. `vendor`. */
  name: string;
  label: string;
  /** Label for the "no filter" option (default "All"). */
  allLabel?: string;
  options: Array<{ value: string; label: string }>;
}

/** The colored category chips row (signals only) — the primary, most-used filter. */
export interface CategoryFacet {
  param: string;
  active: string | null;
  total: number;
  breakdown: Array<{ value: string; count: number; color: string }>;
}

/** The sort control: each option encodes `key:dir`; `defaultValue` is dropped from the URL. */
export interface SortConfig {
  options: Array<{ value: string; label: string }>;
  active: string;
  defaultValue: string;
}

interface ListToolbarProps {
  /** What one row is called, e.g. "signal" — used in the search placeholder. */
  noun: string;
  filters: SelectFilter[];
  sort: SortConfig;
  category?: CategoryFacet;
}

/**
 * The one control strip every big list shares: a search box, the primary category chips
 * (when present), labelled filter dropdowns, and a sort menu. Every change is written to
 * the URL — state stays shareable and refresh-proof — and always resets to page 1 so a
 * narrowed result never strands the user on an empty page. Native `<select>` and real
 * `<Link>` chips keep it fully keyboard-operable with no hover-only affordances.
 */
export function ListToolbar({ noun, filters, sort, category }: ListToolbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const current = Object.fromEntries(searchParams.entries());
  const activeSearch = current.q ?? '';

  const [term, setTerm] = useState(activeSearch);
  // Keep the box in sync when the URL changes from elsewhere (chip, back button).
  useEffect(() => setTerm(activeSearch), [activeSearch]);

  /** Push a new URL with the given overrides applied and the page reset. */
  function apply(overrides: Record<string, string | undefined>) {
    router.push(`${pathname}${buildQuery(current, { ...overrides, page: undefined })}`);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const value = term.trim();
    apply({ q: value || undefined });
  }

  const hasActiveFilters =
    Boolean(activeSearch) ||
    Boolean(category?.active) ||
    filters.some((f) => current[f.name]) ||
    (current.sort ?? '') !== '' ||
    (current.dir ?? '') !== '';

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="relative sm:flex-1" role="search">
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label={`Search ${noun}s`}
            placeholder={`Search ${noun}s…`}
            className="w-full rounded-md border border-field-line bg-field py-2 pl-3 pr-16 text-[13px] text-ink-strong placeholder:text-ink-faint outline-none transition-colors focus:border-accent"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {term && (
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  apply({ q: undefined });
                }}
                aria-label="Clear search"
                className="grid size-7 place-items-center rounded text-ink-faint transition-colors hover:text-ink-strong"
              >
                <X className="size-4" />
              </button>
            )}
            <button
              type="submit"
              aria-label={`Search ${noun}s`}
              className="grid size-7 place-items-center rounded text-ink-dim transition-colors hover:text-accent"
            >
              <Search className="size-4" />
            </button>
          </div>
        </form>

        <label className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-ink-dim">
          <ArrowUpDown className="size-3.5" aria-hidden />
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select
            value={sort.active}
            onChange={(e) => {
              const value = e.target.value;
              const [key, dir] = value.split(':');
              apply(
                value === sort.defaultValue
                  ? { sort: undefined, dir: undefined }
                  : { sort: key, dir },
              );
            }}
            className="rounded-md border border-field-line bg-field px-2 py-1.5 text-[12.5px] text-ink outline-none transition-colors focus:border-accent"
          >
            {sort.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {category && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            href={`${pathname}${buildQuery(current, { [category.param]: undefined, page: undefined })}`}
            isActive={category.active === null}
            label="All"
            count={category.total}
          />
          {category.breakdown.map((c) => (
            <Chip
              key={c.value}
              href={`${pathname}${buildQuery(current, { [category.param]: c.value, page: undefined })}`}
              isActive={category.active === c.value}
              label={c.value}
              count={c.count}
              color={c.color}
            />
          ))}
        </div>
      )}

      {(filters.length > 0 || hasActiveFilters) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {filters.map((filter) => (
            <label
              key={filter.name}
              className="inline-flex items-center gap-1.5 text-[12px] text-ink-dim"
            >
              {filter.label}
              <select
                value={current[filter.name] ?? ''}
                onChange={(e) => apply({ [filter.name]: e.target.value || undefined })}
                className="rounded-md border border-field-line bg-field px-2 py-1.5 text-[12.5px] text-ink outline-none transition-colors focus:border-accent"
              >
                <option value="">{filter.allLabel ?? 'All'}</option>
                {filter.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {hasActiveFilters && (
            <Link
              href={pathname}
              className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-ink-dim transition-colors hover:text-accent"
            >
              <X className="size-3.5" />
              Clear filters
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  href,
  isActive,
  label,
  count,
  color,
}: {
  href: string;
  isActive: boolean;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors',
        isActive
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line text-ink-dim hover:border-accent hover:text-accent',
      )}
    >
      {color && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
      <span className="text-[11px] tabular-nums text-ink-faint">{count}</span>
    </Link>
  );
}
