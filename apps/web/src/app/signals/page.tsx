import type { Metadata } from 'next';
import { Rss } from 'lucide-react';
import { CATEGORIES } from '@leapfrog/core';
import { getSignalsFeed, type Category } from '@/lib/queries';
import { SignalCard } from '@/components/signals/signal-card';
import { EmptyState } from '@/components/ui/empty-state';
import { CategoryFilter } from '@/components/competitors/category-filter';

export const metadata: Metadata = { title: 'Signals' };
export const dynamic = 'force-dynamic';

/** Narrow a raw query-string value to a valid category, ignoring anything unexpected. */
function parseCategory(value: string | string[] | undefined): Category | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return (CATEGORIES as readonly string[]).includes(raw ?? '')
    ? (raw as Category)
    : undefined;
}

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const { category } = await searchParams;
  const { signals, filtered, breakdown, activeCategory } =
    getSignalsFeed(parseCategory(category));

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Rss className="size-6 text-accent" strokeWidth={1.7} />
          Signals
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          Every enriched item in the corpus, newest first.
        </p>
      </div>

      {signals.length === 0 ? (
        <EmptyState
          title="No signals yet"
          hint="Load the demo snapshot to populate the feed. No API key needed."
          command="npm run seed"
        />
      ) : (
        <>
          <div className="mb-5">
            <CategoryFilter
              basePath="/signals"
              active={activeCategory}
              breakdown={breakdown}
              total={signals.length}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
