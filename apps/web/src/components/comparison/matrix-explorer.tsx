'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import type { ComparisonMatrix } from '@leapfrog/core';
import type { CellExplainabilityView, CompetitorCompany } from '@/lib/queries';
import { VendorMark } from '@/components/signals/badges';
import { cn } from '@/lib/utils';
import { MatrixTable } from './matrix-table';

/**
 * Lets the reader build the comparison themselves: any tracked company can be added to or
 * removed from the grid as a column. The focus vendor is always the first column (the "us"
 * every company is compared against). Adding a company we haven't curated shows honest
 * "not rated" cells rather than inventing coverage.
 *
 * The control is deliberately plain (Krug): the current columns are visible as removable
 * chips, and adding is one obvious "Add company" menu of checkboxes — each row the
 * company's own logo + name — so picking is recognition, not recall.
 */
export function MatrixExplorer({
  matrix,
  explain,
  companies,
}: {
  matrix: ComparisonMatrix;
  explain: Record<string, CellExplainabilityView>;
  /** Every competitor company that can be added as a column (focus excluded). */
  companies: CompetitorCompany[];
}) {
  /** Names with curated ratings — everything else renders as "not rated". */
  const ratedVendors = useMemo(
    () => new Set(matrix.vendors.map((v) => v.name)),
    [matrix],
  );

  const bySlug = useMemo(() => new Map(companies.map((c) => [c.slug, c])), [companies]);

  // Start with the curated matrix competitors selected — the grid opens as it always has.
  const [selected, setSelected] = useState<string[]>(() =>
    matrix.vendors
      .filter((v) => v.name !== matrix.focusVendor)
      .map((v) => v.slug)
      .filter((slug) => bySlug.has(slug)),
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const remove = (slug: string) => setSelected((prev) => prev.filter((s) => s !== slug));
  const toggle = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  const focusColumn = matrix.vendors.find((v) => v.name === matrix.focusVendor);

  const visibleMatrix = useMemo<ComparisonMatrix>(() => {
    const columns = selected
      .map((slug) => bySlug.get(slug))
      .filter((c): c is CompetitorCompany => Boolean(c))
      .map((c) => ({ name: c.name, slug: c.slug }));
    return {
      ...matrix,
      vendors: focusColumn ? [focusColumn, ...columns] : columns,
    };
  }, [matrix, selected, bySlug, focusColumn]);

  const selectedCompanies = selected
    .map((slug) => bySlug.get(slug))
    .filter((c): c is CompetitorCompany => Boolean(c));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border border-line bg-card px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Companies
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-accent">
          <VendorMark
            vendor={matrix.focusVendor}
            className="size-[18px] rounded-[3px] text-[8px]"
          />
          {matrix.focusVendor}
          <span className="text-[10px] font-normal opacity-70">focus</span>
        </span>

        {selectedCompanies.map((company) => (
          <span
            key={company.slug}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-2 pr-1 text-[12.5px] font-medium text-ink"
          >
            <VendorMark
              vendor={company.name}
              className="size-[18px] rounded-[3px] text-[8px]"
            />
            {company.name}
            <button
              type="button"
              onClick={() => remove(company.slug)}
              aria-label={`Remove ${company.name} from the matrix`}
              className="grid size-4 place-items-center rounded-full text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}

        <AddCompanyMenu companies={companies} selected={selectedSet} onToggle={toggle} />
      </div>

      {selectedCompanies.length === 0 ? (
        <div className="border border-dashed border-line bg-card px-4 py-10 text-center text-[13px] text-ink-faint">
          Add a company above to compare it against {matrix.focusVendor}.
        </div>
      ) : (
        <MatrixTable
          matrix={visibleMatrix}
          explain={explain}
          ratedVendors={ratedVendors}
        />
      )}
    </div>
  );
}

/**
 * The "Add company" menu: a dropdown of every tracked company as a checkbox row (its own
 * logo + name), so adding or removing a column is a single recognisable click. A type-to
 * filter keeps a long roster scannable; rated companies are tagged so the reader knows
 * which columns come with curated ratings.
 */
function AddCompanyMenu({
  companies,
  selected,
  onToggle,
}: {
  companies: CompetitorCompany[];
  selected: ReadonlySet<string>;
  onToggle: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? companies.filter((c) => c.name.toLowerCase().includes(needle))
    : companies;

  return (
    <div ref={containerRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          open
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-line bg-card text-ink hover:border-ink-faint',
        )}
      >
        <Plus className="size-3.5" strokeWidth={2.5} />
        Add company
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-[264px] overflow-hidden rounded-[6px] border border-line bg-card shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter companies"
              aria-label="Filter companies"
              className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          <ul className="max-h-[320px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-[12.5px] text-ink-faint">
                No companies match “{query}”.
              </li>
            ) : (
              filtered.map((company) => {
                const on = selected.has(company.slug);
                return (
                  <li key={company.slug}>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => onToggle(company.slug)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-canvas"
                    >
                      <span
                        className={cn(
                          'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                          on ? 'border-accent bg-accent text-white' : 'border-line',
                        )}
                        aria-hidden
                      >
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <VendorMark
                        vendor={company.name}
                        className="size-[22px] rounded-[4px] text-[9px]"
                      />
                      <span className="truncate text-[13px] text-ink">
                        {company.name}
                      </span>
                      {!company.onMatrix && (
                        <span className="ml-auto shrink-0 text-[10px] text-ink-faint">
                          not rated
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
