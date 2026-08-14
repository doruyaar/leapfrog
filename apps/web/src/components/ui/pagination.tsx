import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buildQuery, pageWindow } from '@/lib/list-params';
import { cn } from '@/lib/utils';

interface PaginationProps {
  basePath: string;
  /** The current query state (everything but `page`), preserved on every link. */
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
  /** 1-based index of the first and last item shown, and the total, for the summary. */
  from: number;
  to: number;
  total: number;
  /** What one row is called, e.g. "signal" — pluralised with a trailing "s". */
  noun: string;
}

/**
 * Link-based pager (no client JS): every control is a real URL that preserves the
 * active search, filters, and sort. A plain-language summary ("1–24 of 96 signals")
 * sits beside the controls so the user always knows where they are — the pager's
 * "You are here". Rendered only when there is more than one page.
 */
export function Pagination({
  basePath,
  params,
  page,
  totalPages,
  from,
  to,
  total,
  noun,
}: PaginationProps) {
  const href = (target: number) =>
    `${basePath}${buildQuery(params, { page: target === 1 ? undefined : String(target) })}`;

  const summary = (
    <p className="text-[12px] text-ink-dim" aria-live="polite">
      {total === 0 ? (
        `No ${noun}s`
      ) : (
        <>
          <span className="font-medium tabular-nums text-ink">{from}</span>–
          <span className="font-medium tabular-nums text-ink">{to}</span> of{' '}
          <span className="font-medium tabular-nums text-ink">{total}</span> {noun}
          {total === 1 ? '' : 's'}
        </>
      )}
    </p>
  );

  if (totalPages <= 1) {
    return <div className="mt-6 flex justify-center">{summary}</div>;
  }

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex flex-col-reverse items-center justify-between gap-4 border-t border-line-soft pt-5 sm:flex-row"
    >
      {summary}

      <div className="flex items-center gap-1">
        <Edge href={href(page - 1)} disabled={page <= 1} label="Previous page">
          <ChevronLeft className="size-4" />
        </Edge>

        {pageWindow(page, totalPages).map((target, i) =>
          target === null ? (
            <span
              key={`gap-${i}`}
              className="px-1.5 text-[13px] text-ink-faint"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Link
              key={target}
              href={href(target)}
              aria-label={`Page ${target}`}
              aria-current={target === page ? 'page' : undefined}
              className={cn(
                'grid h-8 min-w-8 place-items-center rounded-md px-2 text-[13px] tabular-nums transition-colors',
                target === page
                  ? 'bg-accent font-semibold text-accent-ink'
                  : 'text-ink-dim hover:bg-row-hover hover:text-ink-strong',
              )}
            >
              {target}
            </Link>
          ),
        )}

        <Edge href={href(page + 1)} disabled={page >= totalPages} label="Next page">
          <ChevronRight className="size-4" />
        </Edge>
      </div>
    </nav>
  );
}

/** Prev/next control: a real link when navigable, an inert dimmed span at the ends. */
function Edge({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const classes =
    'grid h-8 min-w-8 place-items-center rounded-md border border-line px-2 transition-colors';
  if (disabled) {
    return (
      <span
        aria-disabled
        className={cn(classes, 'cursor-not-allowed text-ink-faint opacity-50')}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(classes, 'text-ink-dim hover:border-accent hover:text-accent')}
    >
      {children}
    </Link>
  );
}
