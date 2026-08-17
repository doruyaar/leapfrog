import { Check, Sparkles, X } from 'lucide-react';
import type { EvidenceSignal, MatrixSuggestion } from '@leapfrog/core';
import type { EvidenceView } from '@/lib/queries';
import { approveSuggestionAction, rejectSuggestionAction } from '@/lib/actions';
import { formatDate, relativeAge } from '@/lib/format';
import { CitedText } from '@/components/signals/cited-text';
import { VendorMark } from '@/components/signals/badges';
import { TalkAboutButton } from '@/components/ask/talk-about-button';
import { ConfidenceBadge, EvidenceList, LevelChip } from './matrix-visuals';

/** Serialize a core evidence signal for the shared {@link EvidenceList}. */
function toEvidenceView(e: EvidenceSignal): EvidenceView {
  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    vendor: e.vendor,
    category: e.category,
    impactScore: e.impactScore,
    publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
    sourceName: e.sourceName,
    tier: e.tier,
  };
}

/**
 * Recommended matrix updates — the human-in-the-loop review queue.
 *
 * The mental model is "the system discovered new evidence and recommends updating our
 * assessment", not "a value changed from X to Y". So each card leads with the
 * recommendation (what capability, which competitor, the recommended rating), states
 * *why* it was generated with links to the triggering signals, shows a confidence
 * indication and when the evidence was detected, and keeps the current rating as muted
 * context. Approve applies it to the curated matrix and records provenance; Reject
 * dismisses it without touching the matrix or the underlying signals. AI recommends;
 * the analyst decides.
 */
export function RecommendedUpdatesPanel({
  suggestions,
}: {
  suggestions: MatrixSuggestion[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-accent" />
        <h2 className="text-[15px] font-semibold text-ink-strong">
          Recommended matrix updates
        </h2>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-faint">
          {suggestions.length}
        </span>
      </div>

      <p className="mb-4 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-dim">
        The system found new evidence and recommends updating these assessments. Nothing
        changes until you approve it —{' '}
        <span className="font-medium text-ink">AI recommends; you decide</span>. Every
        approval is recorded with its evidence; a rejected recommendation is dismissed and
        leaves the underlying insights untouched.
      </p>

      {suggestions.length === 0 ? (
        <p className="border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">
          No recommendations right now — no unreviewed high-impact insights map to a
          matrix cell.
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <RecommendationCard key={s.suggestionId} suggestion={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecommendationCard({ suggestion: s }: { suggestion: MatrixSuggestion }) {
  const evidence = s.evidence.map(toEvidenceView);
  const multi = evidence.length > 1;
  const levelChanges = s.proposed.level !== s.currentLevel;

  // Scope the assistant to this recommendation; `focusId` pins the driving signal
  // server-side so the discussed evidence is always answerable.
  const chatContext = {
    label: `${s.axisLabel} — ${s.vendor}`,
    preamble:
      `The user is asking about a recommended matrix update for ${s.vendor} on ` +
      `"${s.axisLabel}" (${s.category}, impact ${s.impactScore}/10). ` +
      `Recommended assessment: ${s.proposed.note} ` +
      `Driving evidence: insight #${s.signalId} "${s.signalTitle}".`,
    focusId: s.signalId,
  };

  return (
    <li className="border border-line bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line-soft px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="size-3" />
            Recommended update
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[15px] leading-snug text-ink-strong">
            <span className="font-semibold">{s.axisLabel}</span>
            <span className="text-ink-faint">·</span>
            <VendorMark
              vendor={s.vendor}
              className="size-[18px] rounded-[3px] text-[8px]"
            />
            <span className="font-semibold">{s.vendor}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ConfidenceBadge level={s.confidence} factors={s.confidenceFactors} />
          <span className="text-[11px] text-ink-faint" title={formatDate(s.publishedAt)}>
            Evidence detected {relativeAge(s.publishedAt)}
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="group/talk rounded-[5px] border border-accent/40 bg-accent-soft px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Recommended assessment
            <LevelChip level={s.proposed.level} className="text-accent" />
            <TalkAboutButton
              context={chatContext}
              revealOnHover
              className="ml-auto tracking-normal normal-case"
            />
          </div>
          <CitedText text={s.proposed.note} className="text-[13px] leading-relaxed" />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-faint">
          <span className="uppercase tracking-wider">Currently</span>
          <LevelChip level={s.currentLevel} className="text-[11.5px] text-ink-dim" />
          {levelChanges ? (
            <span className="text-ink-dim">— rating would change</span>
          ) : (
            <span className="text-ink-dim">— note would be enriched</span>
          )}
        </div>

        <div className="mt-3.5 border-t border-line-soft pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            {multi
              ? `Based on ${evidence.length} recent insights`
              : 'Recommended because of'}
            {s.evidenceCount > evidence.length && (
              <span className="ml-1 font-normal normal-case text-ink-faint">
                (most relevant of {s.evidenceCount})
              </span>
            )}
          </div>
          <EvidenceList evidence={evidence} />
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <form action={approveSuggestionAction}>
            <input type="hidden" name="suggestionId" value={s.suggestionId} />
            <button
              type="submit"
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] bg-accent px-3 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Check className="size-3.5" />
              Approve — apply to matrix
            </button>
          </form>
          <form action={rejectSuggestionAction}>
            <input type="hidden" name="suggestionId" value={s.suggestionId} />
            <button
              type="submit"
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] border border-line px-3 text-[12.5px] text-ink-dim transition-colors hover:border-[#c9302c]/50 hover:text-[#c9302c]"
            >
              <X className="size-3.5" />
              Reject
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
