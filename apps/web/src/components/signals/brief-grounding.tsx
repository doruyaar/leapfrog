import Link from 'next/link';
import { AlertTriangle, Quote } from 'lucide-react';
import type { BriefClaim, BriefConflict } from '@leapfrog/core';

/** A citation chip linking a claim or side to the insight it rests on. */
function CiteLink({ id }: { id: number }) {
  return (
    <Link
      href={`/insights/${id}`}
      className="ml-1 inline-flex items-center rounded-[3px] bg-accent-soft px-1.5 align-baseline text-[11px] font-medium text-accent hover:underline"
    >
      #{id}
    </Link>
  );
}

/** One grounded claim: the conclusion, the source it cites, and the verbatim quote. */
function ClaimRow({ claim }: { claim: BriefClaim }) {
  return (
    <li className="border-l-2 border-line pl-3">
      <p className="text-[14px] leading-relaxed text-ink">
        {claim.text}
        <CiteLink id={claim.sourceId} />
      </p>
      <blockquote className="mt-1 flex gap-1.5 text-[12.5px] italic leading-snug text-ink-dim">
        <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" />
        <span>{claim.quote}</span>
      </blockquote>
    </li>
  );
}

/**
 * The grounding behind the summary: every claim shown with the source it cites and the
 * exact quote it rests on. This is what makes each conclusion auditable back to where it
 * is written.
 */
export function BriefClaims({ claims }: { claims: BriefClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <section className="mb-6 border border-line bg-card p-5">
      <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
        Grounding · every claim quoted from its source
      </h2>
      <ul className="flex flex-col gap-3">
        {claims.map((claim, i) => (
          <ClaimRow key={`${claim.sourceId}-${i}`} claim={claim} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Unresolved disagreements between sources. The brief refuses to pick a winner: it shows
 * each side with its own citation and quote and says plainly that it is unresolved — a
 * false certainty is worse than a labelled unknown.
 */
export function BriefConflicts({ conflicts }: { conflicts: BriefConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="mb-6 border border-amber-500/40 bg-amber-500/5 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-amber-600">
        <AlertTriangle className="size-4" strokeWidth={1.8} />
        Unresolved · sources disagree
      </h2>
      <p className="mb-3 text-[12px] text-ink-dim">
        These points are shown, not decided. Review the sources and judge for yourself.
      </p>
      <ul className="flex flex-col gap-4">
        {conflicts.map((conflict, i) => (
          <li key={`${conflict.topic}-${i}`}>
            <p className="text-[13px] font-medium text-ink-strong">{conflict.topic}</p>
            <ul className="mt-1.5 flex flex-col gap-2">
              {conflict.sides.map((side, j) => (
                <li
                  key={`${side.sourceId}-${j}`}
                  className="border-l-2 border-amber-500/40 pl-3"
                >
                  <p className="text-[14px] leading-relaxed text-ink">
                    {side.text}
                    <CiteLink id={side.sourceId} />
                  </p>
                  <blockquote className="mt-1 flex gap-1.5 text-[12.5px] italic leading-snug text-ink-dim">
                    <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" />
                    <span>{side.quote}</span>
                  </blockquote>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[12px] text-ink-faint">{conflict.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
