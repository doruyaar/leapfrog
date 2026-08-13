'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X, Lightbulb, ArrowUpRight } from 'lucide-react';
import { CATEGORY_COLOR, impactColor, relativeAge } from '@/lib/format';
import type { Category } from '@leapfrog/core';

/** Local shape (kept client-safe — no server-only import). Mirrors core's MatrixSuggestion. */
export interface Suggestion {
  vendor: string;
  axisId: string;
  axisLabel: string;
  currentLevel: string;
  currentNote: string;
  signalId: number;
  signalTitle: string;
  category: Category;
  impactScore: number;
  publishedAt: string | null;
}

type Decision = 'accepted' | 'dismissed';

/**
 * The human-in-the-loop review queue. Suggestions are derived from the corpus but never
 * auto-applied: an editor accepts (flag the cell for a curated edit) or dismisses each.
 * Decisions are session-local in the demo — the point is the workflow, not persistence.
 */
export function SuggestionsPanel({ suggestions }: { suggestions: Suggestion[] }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const keyOf = (s: Suggestion) => `${s.vendor}::${s.axisId}::${s.signalId}`;

  const pending = suggestions.filter((s) => !decisions[keyOf(s)]);
  const acceptedCount = Object.values(decisions).filter((d) => d === 'accepted').length;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4 text-accent" />
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Suggested updates
        </h2>
        <span className="text-[11px] text-ink-faint">
          {pending.length} pending
          {acceptedCount > 0 && ` · ${acceptedCount} flagged`}
        </span>
      </div>

      <p className="mb-3 text-[12px] text-ink-dim">
        Recent signals that touch a cell, ranked by impact × recency. Nothing is applied
        automatically — accept to flag a cell for a curated edit, or dismiss.{' '}
        <span className="text-ink-faint">Decisions are session-local in the demo.</span>
      </p>

      {suggestions.length === 0 ? (
        <p className="border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">
          No suggestions — no recent high-impact signals map to a matrix cell.
        </p>
      ) : pending.length === 0 ? (
        <p className="border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">
          Queue cleared. All suggestions reviewed for this session.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {pending.map((s) => {
            const key = keyOf(s);
            return (
              <li
                key={key}
                className="flex items-start gap-3 border border-line bg-card px-4 py-3"
              >
                <span
                  className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-[3px] text-[11px] font-semibold text-white"
                  style={{ backgroundColor: impactColor(s.impactScore) }}
                  title={`Impact ${s.impactScore}`}
                >
                  {s.impactScore}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
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
                    className="group mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:text-accent"
                  >
                    {s.signalTitle}
                    <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>

                  <p className="mt-1 text-[11.5px] text-ink-faint">
                    Current cell — <span className="text-ink-dim">{s.currentNote}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDecisions((d) => ({ ...d, [key]: 'accepted' }))}
                    className="inline-flex h-[30px] items-center gap-1 rounded-[4px] bg-accent px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Check className="size-3.5" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisions((d) => ({ ...d, [key]: 'dismissed' }))}
                    className="inline-flex size-[30px] items-center justify-center rounded-[4px] border border-line text-ink-dim transition-colors hover:border-accent hover:text-accent"
                    title="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
