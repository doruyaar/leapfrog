import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { CellLevel, ConfidenceFactors, ConfidenceLevel } from '@leapfrog/core';
import type { EvidenceView } from '@/lib/queries';
import { CATEGORY_COLOR, formatDate, impactColor, relativeAge } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Coverage level → colour + plain word. `none` reads as a gap; `info` is neutral
 * (nuance, not a score). One source of truth for both the grid and the recommendations.
 */
export const LEVEL_STYLE: Record<CellLevel, { dot: string; label: string }> = {
  strong: { dot: 'bg-[#3bc03f]', label: 'Strong' },
  partial: { dot: 'bg-[#d9a521]', label: 'Partial' },
  none: { dot: 'bg-[#c9302c]', label: 'Gap' },
  info: { dot: 'bg-[#6b93b8]', label: 'Varies' },
};

/** A coloured dot + level word — the glanceable coverage rating. */
export function LevelChip({
  level,
  className,
}: {
  level: CellLevel;
  className?: string;
}) {
  const style = LEVEL_STYLE[level];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[12px] text-ink', className)}
    >
      <span className={cn('size-2.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

const CONFIDENCE_STYLE: Record<
  ConfidenceLevel,
  { label: string; bars: number; className: string; barOn: string }
> = {
  high: {
    label: 'High',
    bars: 3,
    className: 'border-[#3bc03f]/40 bg-[#3bc03f]/10 text-[#2a8a2e]',
    barOn: 'bg-[#2a8a2e]',
  },
  medium: {
    label: 'Medium',
    bars: 2,
    className: 'border-[#d9a521]/50 bg-[#d9a521]/10 text-[#a67c14]',
    barOn: 'bg-[#a67c14]',
  },
  low: {
    label: 'Low',
    bars: 1,
    className: 'border-line bg-canvas text-ink-dim',
    barOn: 'bg-ink-faint',
  },
};

/** One plain sentence describing what the confidence is based on — no fake precision. */
export function describeConfidence(factors: ConfidenceFactors): string {
  if (factors.evidenceCount === 0) {
    return 'Editorial judgment — no recent tracked insights support this yet.';
  }
  const parts = [
    `${factors.evidenceCount} supporting ${factors.evidenceCount === 1 ? 'insight' : 'insights'}`,
    `strongest impact ${factors.maxImpact}/5`,
    factors.hasPrimarySource ? 'primary source' : 'secondary sources only',
  ];
  return parts.join(' · ');
}

/**
 * Confidence as a three-bar meter plus a plain word (High/Medium/Low). The bar count
 * makes it scannable; the label removes any doubt about direction.
 */
export function ConfidenceBadge({
  level,
  factors,
  className,
}: {
  level: ConfidenceLevel;
  factors?: ConfidenceFactors;
  className?: string;
}) {
  const style = CONFIDENCE_STYLE[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        style.className,
        className,
      )}
      title={factors ? describeConfidence(factors) : undefined}
    >
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              'w-[3px] rounded-[1px]',
              i === 0 ? 'h-[6px]' : i === 1 ? 'h-[9px]' : 'h-[12px]',
              i < style.bars ? style.barOn : 'bg-line',
            )}
          />
        ))}
      </span>
      {style.label} confidence
    </span>
  );
}

/** A primary/secondary source-tier tag. */
function TierTag({ tier }: { tier: EvidenceView['tier'] }) {
  return (
    <span
      className={cn(
        'font-medium',
        tier === 'primary' ? 'text-[#2a8a2e]' : 'text-ink-dim',
      )}
    >
      {tier} source
    </span>
  );
}

/**
 * The supporting evidence behind a rating: each signal links to its full detail
 * (reusing the existing `/insights/{id}` route), identifies the competitor, and shows
 * its source tier and age. Rendered in the order given — most relevant first.
 */
export function EvidenceList({
  evidence,
  className,
}: {
  evidence: EvidenceView[];
  className?: string;
}) {
  if (evidence.length === 0) {
    return (
      <p className={cn('text-[12px] text-ink-faint', className)}>
        No tracked insights support this rating yet — it reflects editorial judgment.
      </p>
    );
  }
  return (
    <ul className={cn('space-y-2', className)}>
      {evidence.map((e) => (
        <li key={e.id}>
          <Link
            href={`/insights/${e.id}`}
            className="group inline-flex items-start gap-1 text-[12.5px] font-medium leading-snug text-ink hover:text-accent"
          >
            <span
              className="mt-[5px] size-2 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[e.category] }}
              aria-hidden
            />
            <span>
              {e.title}
              <ArrowUpRight className="ml-0.5 inline size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </Link>
          <div className="ml-3 mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-faint">
            {e.vendor && <span className="text-ink-dim">{e.vendor}</span>}
            <span>·</span>
            <span
              className="grid size-[15px] place-items-center rounded-[2px] text-[9px] font-semibold text-white"
              style={{ backgroundColor: impactColor(e.impactScore) }}
              title={`Impact ${e.impactScore}`}
            >
              {e.impactScore}
            </span>
            <span>·</span>
            <TierTag tier={e.tier} />
            <span>·</span>
            <span title={formatDate(e.publishedAt)}>{relativeAge(e.publishedAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
