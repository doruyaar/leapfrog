import type { Metadata } from 'next';
import { ArrowRightLeft } from 'lucide-react';
import { getChangeFeed } from '@/lib/queries';
import { ChangeCard, FilteredChangesRow } from '@/components/changes/change-card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Changes' };
export const dynamic = 'force-dynamic';

/**
 * The change feed (GAP-PLAN §3.3): not what was *published*, but what actually
 * *changed* — before → after per vendor and dimension, with re-phrasings visibly
 * filtered out rather than silently dropped.
 */
export default function ChangesPage() {
  const { material, filtered } = getChangeFeed();

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <ArrowRightLeft className="size-6 text-accent" strokeWidth={1.7} />
          Changes
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          What actually changed in each vendor&apos;s state — compared to what we knew
          before. Re-wordings of known facts are collapsed, not counted.
        </p>
      </div>

      {material.length === 0 && filtered.length === 0 ? (
        <EmptyState
          title="No change events yet"
          hint="Load the demo snapshot (it includes revised and re-published items), or run the diff stage after your next ingest."
          command="npm run seed"
        />
      ) : (
        <div className="max-w-[820px] space-y-4">
          <FilteredChangesRow events={filtered} />
          {material.map((event) => (
            <ChangeCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
