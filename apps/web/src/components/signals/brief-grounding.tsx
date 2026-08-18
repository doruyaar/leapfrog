import Link from 'next/link';
import { Quote, Scale } from 'lucide-react';
import type { BriefConflict } from '@leapfrog/core';
import { cn } from '@/lib/utils';

/**
 * Rendering disagreements between sources. The brief refuses to pick a winner: both sides
 * stay visible with their own citations and quotes — a false certainty is worse than a
 * labelled unknown. A disagreement is not an error, so it is framed calmly, not as a
 * warning: contested citations in the summary render amber (vs. green for settled) and
 * hover to preview both sides, while the full accounts live in a dedicated section at the
 * end of the brief ({@link BriefConflictsSection}) and on each implicated insight's detail
 * page ({@link ConflictPanel}).
 */

/** Amber citation pill: the contested counterpart of the green pill in `CitedText`. */
function ConflictPill({ id }: { id: number }) {
  return (
    <Link
      href={`/insights/${id}#conflict`}
      className="inline-flex items-center rounded-[3px] bg-amber-500/10 px-1.5 align-baseline text-[11px] font-medium text-amber-600 hover:underline"
    >
      #{id}
    </Link>
  );
}

/** Both sides of a disagreement, quoted — the tooltip body (inline elements only). */
function ConflictTooltipBody({ conflict }: { conflict: BriefConflict }) {
  return (
    <>
      <span className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-600">
        <Scale className="size-3 shrink-0" strokeWidth={1.8} />
        Sources disagree · {conflict.topic}
      </span>
      {conflict.sides.map((side, i) => (
        <span
          key={`${side.sourceId}-${i}`}
          className="mt-2 block border-l-2 border-amber-500/40 pl-2 first:mt-0"
        >
          <span className="block text-[12px] leading-snug text-ink">
            <span className="font-medium text-amber-600">#{side.sourceId}</span>{' '}
            {side.text}
          </span>
          <span className="mt-0.5 flex gap-1.5 text-[11.5px] italic leading-snug text-ink-dim">
            <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" />
            <span>{side.quote}</span>
          </span>
        </span>
      ))}
      <span className="mt-2 block text-[11px] leading-snug text-ink-faint">
        {conflict.note}
      </span>
    </>
  );
}

/**
 * An amber citation for a contested source. Hover (or keyboard focus) reveals both sides
 * of the disagreement with their quotes; clicking opens the insight, whose detail page
 * carries the full conflict panel — the tooltip is a preview, never the only path.
 */
export function ConflictCite({ id, conflict }: { id: number; conflict: BriefConflict }) {
  return (
    <span className="group relative mx-0.5 inline-block">
      <ConflictPill id={id} />
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none invisible absolute top-full left-1/2 z-30 mt-2 w-80 max-w-[85vw]',
          '-translate-x-1/2 rounded-md border border-line bg-card p-3 text-left opacity-0 shadow-lg',
          'transition-opacity duration-150',
          'group-hover:visible group-hover:opacity-100',
          'group-focus-within:visible group-focus-within:opacity-100',
        )}
      >
        <ConflictTooltipBody conflict={conflict} />
      </span>
    </span>
  );
}

/** One disagreement laid out in full: the topic, each side quoted and referenced. */
function ConflictEntry({ conflict }: { conflict: BriefConflict }) {
  return (
    <li>
      <p className="mb-2 text-[13px] font-medium text-ink-strong">{conflict.topic}</p>
      <ul className="flex flex-col gap-2.5">
        {conflict.sides.map((side, j) => (
          <li
            key={`${side.sourceId}-${j}`}
            className="border-l-2 border-amber-500/40 pl-3"
          >
            <p className="text-[14px] leading-relaxed text-ink">
              {side.text}
              <ConflictPill id={side.sourceId} />
            </p>
            <blockquote className="mt-1 flex gap-1.5 text-[12.5px] italic leading-snug text-ink-dim">
              <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" />
              <span>{side.quote}</span>
            </blockquote>
          </li>
        ))}
      </ul>
      {conflict.note && (
        <p className="mt-2 text-[12px] text-ink-faint">{conflict.note}</p>
      )}
    </li>
  );
}

/**
 * The disagreements section, placed at the end of the brief. It opens by explaining what
 * a disagreement is — two sources describing the same thing differently — then shows each
 * one with both accounts quoted and referenced. Calm, not alarming: a disagreement is
 * information to weigh, not a problem to fix.
 */
export function BriefConflictsSection({ conflicts }: { conflicts: BriefConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="mb-6 border border-line bg-card p-5">
      <h2 className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
        <Scale className="size-4 text-amber-600" strokeWidth={1.7} />
        Facts that are in conflict
      </h2>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-dim">
        These appear when two sources describe the same thing differently. Both accounts
        are shown below with their quotes and references — the brief doesn&apos;t pick a
        winner, so you can weigh them and judge for yourself.
      </p>
      <ul className="flex flex-col gap-5">
        {conflicts.map((conflict, i) => (
          <ConflictEntry key={`${conflict.topic}-${i}`} conflict={conflict} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The full disagreement, shown on the insight detail page of every implicated source:
 * this insight's own account, each competing account with its quote and a link to the
 * insight behind it, and why the record is surfaced rather than resolved.
 */
export function ConflictPanel({
  conflicts,
  selfId,
}: {
  conflicts: BriefConflict[];
  selfId: number;
}) {
  if (conflicts.length === 0) return null;
  return (
    <div id="conflict" className="mt-3 flex flex-col gap-3 scroll-mt-4">
      {conflicts.map((conflict, i) => {
        const others = conflict.sides.filter((side) => side.sourceId !== selfId);
        return (
          <div
            key={`${conflict.topic}-${i}`}
            className="border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
              <Scale className="size-3.5 shrink-0" strokeWidth={1.8} />
              Sources disagree — {conflict.topic}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink">
              This insight is one side of a disagreement in today&apos;s brief. The other
              account:
            </p>
            {others.map((side, j) => (
              <div key={`${side.sourceId}-${j}`} className="mt-2">
                <p className="text-[13.5px] leading-relaxed text-ink">
                  {side.text}
                  <ConflictPill id={side.sourceId} />
                </p>
                <blockquote className="mt-1 flex gap-1.5 text-[12px] italic leading-snug text-ink-dim">
                  <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" />
                  <span>{side.quote}</span>
                </blockquote>
              </div>
            ))}
            <p className="mt-2 text-[11.5px] text-ink-faint">{conflict.note}</p>
          </div>
        );
      })}
    </div>
  );
}
