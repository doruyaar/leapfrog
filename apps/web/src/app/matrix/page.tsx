import type { Metadata } from 'next';
import { Table2 } from 'lucide-react';
import {
  getComparisonMatrix,
  getMatrixExplainability,
  getMatrixSuggestions,
} from '@/lib/queries';
import { MatrixTable, MatrixLegend } from '@/components/comparison/matrix-table';
import { RecommendedUpdatesPanel } from '@/components/comparison/recommended-updates';

export const metadata: Metadata = { title: 'Competitive Matrix' };
export const dynamic = 'force-dynamic';

export default async function ComparisonPage() {
  const matrix = getComparisonMatrix();
  const suggestions = await getMatrixSuggestions(matrix);
  const explain = getMatrixExplainability(matrix);

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Table2 className="size-6 text-accent" strokeWidth={1.7} />
          Competitive Matrix
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          JFrog vs. the field across capability axes. Each cell shows a coverage rating —
          click it to see the evidence, confidence, and last update behind it.
        </p>
      </div>

      <MatrixTable matrix={matrix} explain={explain} />
      <MatrixLegend />

      <div className="mt-9">
        <RecommendedUpdatesPanel suggestions={suggestions} />
      </div>
    </div>
  );
}
