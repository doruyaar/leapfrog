import Link from 'next/link';
import type { SignalSummary } from '@/lib/queries';
import { CATEGORY_COLOR, formatDate, impactColor } from '@/lib/format';

interface DateGroup {
  label: string;
  signals: SignalSummary[];
}

/** Group already newest-first signals into contiguous runs by publish date. */
function groupByDate(signals: SignalSummary[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const signal of signals) {
    const label = formatDate(signal.publishedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.signals.push(signal);
    else groups.push({ label, signals: [signal] });
  }
  return groups;
}

/**
 * A vertical, dated history of a competitor's tracked activity. The timeline is the
 * "what has this vendor been doing" view — a continuous spine with a category-coloured
 * node per signal, newest at the top.
 */
export function VendorTimeline({ signals }: { signals: SignalSummary[] }) {
  if (signals.length === 0) {
    return (
      <p className="border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-faint">
        No signals in this category yet.
      </p>
    );
  }

  const groups = groupByDate(signals);

  return (
    <div className="relative pl-6">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-line" aria-hidden />
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              {group.label}
            </div>
            <div className="space-y-2.5">
              {group.signals.map((signal) => (
                <div key={signal.id} className="relative">
                  <span
                    className="absolute -left-[22px] top-[7px] size-[9px] rounded-full ring-2 ring-canvas"
                    style={{ backgroundColor: CATEGORY_COLOR[signal.category] }}
                    aria-hidden
                  />
                  <Link
                    href={`/signals/${signal.id}`}
                    className="group flex items-start gap-3 border border-line bg-card px-3.5 py-2.5 transition-colors hover:border-accent"
                  >
                    <span
                      className="mt-0.5 grid size-[20px] shrink-0 place-items-center rounded-[3px] text-[11px] font-semibold text-white"
                      style={{ backgroundColor: impactColor(signal.impactScore) }}
                    >
                      {signal.impactScore}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[11px]"
                          style={{ color: CATEGORY_COLOR[signal.category] }}
                        >
                          {signal.category}
                        </span>
                      </div>
                      <h3 className="text-[13.5px] font-medium leading-snug text-ink-strong group-hover:text-accent">
                        {signal.title}
                      </h3>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-dim">
                        {signal.summary}
                      </p>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
