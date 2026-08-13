import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Category } from '@leapfrog/core';
import { CATEGORY_COLOR, formatDate, relativeAge } from '@/lib/format';
import { CategoryBadge, ImpactBadge, VendorMark } from './badges';

/** The minimal signal shape a card renders — satisfied by both feed rows and brief items. */
export interface CardSignal {
  id: number;
  title: string;
  vendor: string | null;
  category: Category;
  impactScore: number;
  summary: string;
  whyItMatters: string;
  publishedAt: Date | string | null;
}

/**
 * The unit of the product: one triaged, scored, "so-what"-annotated signal. Clicking it
 * opens the detail view; every card carries its impact, category, vendor, and the
 * grounded "why it matters" line so the feed is scannable without drilling in.
 */
export function SignalCard({ signal, rank }: { signal: CardSignal; rank?: number }) {
  return (
    <Link
      href={`/signals/${signal.id}`}
      className="group relative flex flex-col gap-3 border border-line bg-card p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.10)]"
      style={{ borderLeft: `3px solid ${CATEGORY_COLOR[signal.category]}` }}
    >
      <div className="flex items-center gap-2.5">
        <VendorMark vendor={signal.vendor} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink-strong">
            {signal.vendor ?? 'Market'}
          </div>
          <div className="text-[11px] text-ink-faint">
            {relativeAge(signal.publishedAt)}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <CategoryBadge category={signal.category} />
          <ImpactBadge score={signal.impactScore} />
        </div>
      </div>

      <div className="flex items-start gap-2">
        {rank !== undefined && (
          <span className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink-faint">
            {rank}.
          </span>
        )}
        <h3 className="text-[15px] font-medium leading-snug text-ink-strong group-hover:text-accent">
          {signal.title}
        </h3>
      </div>

      <p className="line-clamp-2 text-[13px] text-ink-dim">{signal.summary}</p>

      <div className="mt-auto border-t border-line-soft pt-3">
        <p className="line-clamp-2 text-[12.5px] text-ink">
          <span className="font-medium text-accent">Why it matters — </span>
          {signal.whyItMatters}
        </p>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
        <ArrowUpRight className="size-4" />
      </div>

      <span className="sr-only">{formatDate(signal.publishedAt)}</span>
    </Link>
  );
}
