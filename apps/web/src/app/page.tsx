import type { Metadata } from 'next';
import { CalendarDays, Sparkles } from 'lucide-react';
import { getBrief, getCorroboration, getMaterialChangeIds } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { CitedText } from '@/components/signals/cited-text';
import { SignalCard } from '@/components/signals/signal-card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: "Today's Brief" };
export const dynamic = 'force-dynamic';

/** The home screen is the product: today's triaged, scored, cited brief. */
export default async function HomePage() {
  const brief = await getBrief();
  // Material state changes and corroboration verdicts for the ranked items —
  // the brief distinguishes *news* from *change*, and shows whether to trust it.
  const itemIds = brief?.items.map((item) => item.id) ?? [];
  const changedIds = getMaterialChangeIds(itemIds);
  const corroborations = new Map(
    itemIds.map((id) => [id, getCorroboration(id)?.status] as const),
  );

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
            <Sparkles className="size-6 text-accent" strokeWidth={1.7} />
            Today&apos;s Brief
          </h1>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-dim">
            <CalendarDays className="size-4" />
            {brief ? formatDate(brief.date) : 'Not yet composed'}
            {brief && (
              <span className="ml-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-faint">
                {brief.live ? 'composed live' : `stored · ${brief.model ?? 'n/a'}`}
              </span>
            )}
          </p>
        </div>
      </div>

      {!brief || brief.items.length === 0 ? (
        <EmptyState
          title="No brief yet"
          hint="Load the demo snapshot, then reload — the brief composes itself from the seeded corpus. No API key needed."
          command="npm run seed"
        />
      ) : (
        <>
          <section className="mb-6 border border-line bg-card p-5">
            <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
              Executive summary
            </h2>
            <CitedText
              text={brief.summary}
              className="text-[15px] leading-relaxed text-ink"
            />
            <p className="mt-3 text-[12px] text-ink-faint">
              Ranked by impact × recency · citations link to the source insight.
            </p>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {brief.items.map((item, i) => (
              <SignalCard
                key={item.id}
                signal={item}
                rank={i + 1}
                stateChange={changedIds.has(item.id)}
                corroboration={corroborations.get(item.id) ?? undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
