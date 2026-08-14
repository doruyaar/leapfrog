import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import type { ChangeEventSummary } from '@/lib/queries';
import { relativeAge } from '@/lib/format';
import { ImpactBadge, VendorMark } from '@/components/signals/badges';

/** Dimension → pill colour. Same palette family as the category colours. */
const DIMENSION_COLOR: Record<ChangeEventSummary['dimension'], string> = {
  pricing: '#d9822b',
  capability: '#3bc03f',
  release: '#2f78d1',
  security: '#c9302c',
  positioning: '#8b5cf6',
};

const KIND_LABEL: Record<ChangeEventSummary['kind'], string> = {
  new: 'New development',
  update: 'State changed',
  rephrase: 'Re-phrasing',
  duplicate: 'Duplicate',
};

function DimensionBadge({ dimension }: { dimension: ChangeEventSummary['dimension'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-dim">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: DIMENSION_COLOR[dimension] }}
      />
      {dimension}
    </span>
  );
}

/**
 * One detected change: what the vendor's state was, what it is now, and the
 * evidence. The before → after pair is the demo moment — two short quoted lines,
 * the source's own words (deterministic path) or a validated model comparison.
 */
export function ChangeCard({ event }: { event: ChangeEventSummary }) {
  return (
    <article
      className="border border-line bg-card p-4"
      style={{ borderLeft: `3px solid ${DIMENSION_COLOR[event.dimension]}` }}
    >
      <div className="flex items-center gap-2.5">
        <VendorMark vendor={event.vendor} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-ink-strong">
            {event.vendor}
          </div>
          <div className="text-[11px] text-ink-faint">
            {KIND_LABEL[event.kind]} · {relativeAge(event.publishedAt)}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <DimensionBadge dimension={event.dimension} />
          <ImpactBadge score={event.materiality} />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {event.before !== null && (
          <blockquote className="border-l-2 border-line px-3 py-1.5 text-[13px] leading-snug text-ink-faint">
            <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider">
              Before
            </span>
            “{event.before}”
          </blockquote>
        )}
        {event.before !== null && (
          <div className="flex justify-start pl-3 text-ink-faint">
            <ArrowDown className="size-3.5" />
          </div>
        )}
        <blockquote className="border-l-2 border-accent bg-accent-soft px-3 py-1.5 text-[13px] leading-snug text-ink">
          <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {event.before !== null ? 'After' : 'Now'}
          </span>
          “{event.after}”
        </blockquote>
      </div>

      {event.rationale && (
        <p className="mt-2 text-[11.5px] italic text-ink-faint">{event.rationale}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-2.5">
        <Link
          href={`/signals/${event.triggerItemId}`}
          className="group inline-flex min-w-0 items-center gap-1 text-[12.5px] font-medium text-ink hover:text-accent"
        >
          <span className="truncate">{event.triggerTitle}</span>
          <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        <span className="shrink-0 text-[11px] text-ink-faint" title="Provenance">
          {event.model} · {event.promptVersion}
        </span>
      </div>
    </article>
  );
}

/**
 * The collapsed noise row (GAP-PLAN §3.3): re-phrasings and duplicates are
 * de-emphasized, never hidden — expanding shows each with what it re-states.
 */
export function FilteredChangesRow({ events }: { events: ChangeEventSummary[] }) {
  if (events.length === 0) return null;

  return (
    <details className="group border border-dashed border-line bg-canvas px-4 py-3">
      <summary className="cursor-pointer list-none text-[13px] text-ink-faint transition-colors hover:text-ink-dim">
        {events.length} re-phrasing{events.length === 1 ? '' : 's'} filtered — no state
        change, collapsed as noise.{' '}
        <span className="underline decoration-dotted underline-offset-2 group-open:hidden">
          Show
        </span>
        <span className="hidden underline decoration-dotted underline-offset-2 group-open:inline">
          Hide
        </span>
      </summary>
      <ul className="mt-3 space-y-2.5 border-t border-line-soft pt-3">
        {events.map((event) => (
          <li key={event.id} className="text-[12.5px] leading-snug">
            <Link
              href={`/signals/${event.triggerItemId}`}
              className="font-medium text-ink-dim hover:text-accent"
            >
              {event.triggerTitle}
            </Link>
            <div className="mt-0.5 text-[11.5px] text-ink-faint">
              {event.vendor} · {KIND_LABEL[event.kind].toLowerCase()}
              {event.before !== null && <> of “{event.before}”</>} ·{' '}
              {relativeAge(event.publishedAt)}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
