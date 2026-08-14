import Link from 'next/link';
import { SearchX } from 'lucide-react';

/**
 * Shown when the corpus has data but the active search or filters match nothing. Unlike
 * {@link EmptyState} (a missing database), this always offers the one obvious way out —
 * clearing back to the full list — so a dead-end filter is never a dead end.
 */
export function NoResults({ noun, resetHref }: { noun: string; resetHref: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center border border-dashed border-line bg-card">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <SearchX className="size-7 text-ink-faint" strokeWidth={1.6} />
        <p className="text-[16px] text-ink-strong">No {noun}s match your filters</p>
        <p className="text-[13px] text-ink-dim">
          Try a different search term or loosen a filter.
        </p>
        <Link
          href={resetHref}
          className="mt-1 inline-flex items-center rounded-md border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-dim transition-colors hover:border-accent hover:text-accent"
        >
          Clear all filters
        </Link>
      </div>
    </div>
  );
}
