import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Lightbulb, X } from 'lucide-react';
import type { CellLevel } from '@leapfrog/core';
import type { MatrixSuggestion } from '@/lib/queries';
import { approveSuggestionAction, rejectSuggestionAction } from '@/lib/actions';
import { CATEGORY_COLOR, impactColor, relativeAge } from '@/lib/format';
import { CitedText } from '@/components/signals/cited-text';
import { cn } from '@/lib/utils';

const LEVEL_STYLE: Record<CellLevel, { dot: string; label: string }> = {
  strong: { dot: 'bg-[#3bc03f]', label: 'Strong' },
  partial: { dot: 'bg-[#d9a521]', label: 'Partial' },
  none: { dot: 'bg-[#c9302c]', label: 'Gap' },
  info: { dot: 'bg-[#6b93b8]', label: 'Varies' },
};

function LevelDot({ level }: { level: CellLevel }) {
  const style = LEVEL_STYLE[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
      <span className={cn('size-2 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

/**
 * The approval gate (GAP-PLAN §5.2): each suggestion arrives as a *drafted, cited
 * edit* — current cell next to proposed cell — and a real Approve button applies it
 * to the curated matrix while appending an immutable audit record. Reject settles
 * the suggestion so it never resurfaces. The analyst approves; they don't
 * transcribe.
 */
export function PendingUpdatesPanel({ suggestions }: { suggestions: MatrixSuggestion[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4 text-accent" />
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Pending updates
        </h2>
        <span className="text-[11px] text-ink-faint">{suggestions.length} drafted</span>
      </div>

      <p className="mb-3 text-[12px] text-ink-dim">
        Drafted edits from recent signals, ranked by impact × recency. Nothing changes
        the matrix until you approve it; every approval is recorded in the audit trail,
        and a rejected draft stays dismissed.
      </p>

      {suggestions.length === 0 ? (
        <p className="border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">
          No pending updates — no unreviewed high-impact signals map to a matrix cell.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {suggestions.map((s) => (
            <li key={s.suggestionId} className="border border-line bg-card px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                <span
                  className="grid size-[22px] shrink-0 place-items-center rounded-[3px] text-[11px] font-semibold text-white"
                  style={{ backgroundColor: impactColor(s.impactScore) }}
                  title={`Impact ${s.impactScore}`}
                >
                  {s.impactScore}
                </span>
                <span className="font-semibold text-ink-strong">{s.vendor}</span>
                <span className="text-ink-faint">·</span>
                <span className="text-ink-dim">{s.axisLabel}</span>
                <span
                  className="inline-flex items-center gap-1 text-[11px] text-ink-faint"
                  title={s.category}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLOR[s.category] }}
                  />
                  {s.category}
                </span>
                <span className="text-[11px] text-ink-faint">
                  {relativeAge(s.publishedAt)}
                </span>
              </div>

              <Link
                href={`/signals/${s.signalId}`}
                className="group mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:text-accent"
              >
                {s.signalTitle}
                <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>

              <div className="mt-2.5 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                <div className="border border-line bg-canvas px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                      Current
                    </span>
                    <LevelDot level={s.currentLevel} />
                  </div>
                  <p className="text-[12.5px] leading-snug text-ink-dim">
                    {s.currentNote}
                  </p>
                </div>
                <div className="hidden items-center text-ink-faint md:flex">
                  <ArrowRight className="size-4" />
                </div>
                <div className="border border-accent/40 bg-accent-soft px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      Proposed
                    </span>
                    <LevelDot level={s.proposed.level} />
                  </div>
                  <CitedText
                    text={s.proposed.note}
                    className="text-[12.5px] leading-snug"
                  />
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-1.5">
                <form action={approveSuggestionAction}>
                  <input type="hidden" name="suggestionId" value={s.suggestionId} />
                  <button
                    type="submit"
                    className="inline-flex h-[30px] items-center gap-1 rounded-[4px] bg-accent px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Check className="size-3.5" />
                    Approve — apply to matrix
                  </button>
                </form>
                <form action={rejectSuggestionAction}>
                  <input type="hidden" name="suggestionId" value={s.suggestionId} />
                  <button
                    type="submit"
                    className="inline-flex h-[30px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-accent"
                  >
                    <X className="size-3.5" />
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
