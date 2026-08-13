import type { Metadata } from 'next';
import { Table2 } from 'lucide-react';
import { getComparisonMatrix, getMatrixSuggestions } from '@/lib/queries';
import { MatrixTable, MatrixLegend } from '@/components/comparison/matrix-table';
import {
  SuggestionsPanel,
  type Suggestion,
} from '@/components/comparison/suggestions-panel';

export const metadata: Metadata = { title: 'Comparison Matrix' };
export const dynamic = 'force-dynamic';

export default function ComparisonPage() {
  const matrix = getComparisonMatrix();
  const suggestions: Suggestion[] = getMatrixSuggestions(matrix).map((s) => ({
    vendor: s.vendor,
    axisId: s.axisId,
    axisLabel: s.axisLabel,
    currentLevel: s.currentLevel,
    currentNote: s.currentNote,
    signalId: s.signalId,
    signalTitle: s.signalTitle,
    category: s.category,
    impactScore: s.impactScore,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
  }));

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Table2 className="size-6 text-accent" strokeWidth={1.7} />
          Comparison Matrix
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          A curated, human-owned capability grid across the field. The corpus proposes
          which cells to revisit — a person decides what changes.
        </p>
      </div>

      <MatrixTable matrix={matrix} />
      <MatrixLegend />

      <div className="mt-8">
        <SuggestionsPanel suggestions={suggestions} />
      </div>
    </div>
  );
}
