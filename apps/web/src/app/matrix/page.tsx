import type { Metadata } from 'next';
import { Table2 } from 'lucide-react';
import {
  getComparisonMatrix,
  getCompetitorCompanies,
  getMatrixExplainability,
  getMatrixSuggestions,
} from '@/lib/queries';
import { MatrixLegend } from '@/components/comparison/matrix-table';
import { MatrixExplorer } from '@/components/comparison/matrix-explorer';
import { RecommendedUpdatesPanel } from '@/components/comparison/recommended-updates';

export const metadata: Metadata = { title: 'Competitive Matrix' };
export const dynamic = 'force-dynamic';

export default async function ComparisonPage() {
  const matrix = getComparisonMatrix();
  const suggestions = await getMatrixSuggestions(matrix);
  const explain = getMatrixExplainability(matrix);
  const companies = getCompetitorCompanies();

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Table2 className="size-6 text-accent" strokeWidth={1.7} />
          Competitive Matrix
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          JFrog vs. the field across capability axes. Each cell shows a coverage rating —
          click it to see the evidence, confidence, and last update behind it. Add or
          remove any tracked company with the controls above the grid.
        </p>
      </div>

      <MatrixExplorer matrix={matrix} explain={explain} companies={companies} />
      <MatrixLegend />

      <div className="mt-9">
        <RecommendedUpdatesPanel suggestions={suggestions} />
      </div>
    </div>
  );
}
