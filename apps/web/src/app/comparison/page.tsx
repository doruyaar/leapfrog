import type { Metadata } from 'next';
import { Table2 } from 'lucide-react';
import {
  getComparisonMatrix,
  getMatrixCellAudit,
  getMatrixSuggestions,
} from '@/lib/queries';
import {
  MatrixTable,
  MatrixLegend,
  type CellAuditInfo,
} from '@/components/comparison/matrix-table';
import { PendingUpdatesPanel } from '@/components/comparison/pending-updates';

export const metadata: Metadata = { title: 'Comparison Matrix' };
export const dynamic = 'force-dynamic';

export default async function ComparisonPage() {
  const matrix = getComparisonMatrix();
  const suggestions = await getMatrixSuggestions(matrix);

  const audit: Record<string, CellAuditInfo> = {};
  for (const [key, entry] of getMatrixCellAudit()) {
    audit[key] = {
      approvedAt: entry.approvedAt.toISOString(),
      signalId: entry.signalId,
    };
  }

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Table2 className="size-6 text-accent" strokeWidth={1.7} />
          Comparison Matrix
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          A curated, human-owned capability grid across the field. The corpus drafts
          cited edits for cells worth revisiting — a person approves what changes, and
          every approval leaves an audit trail.
        </p>
      </div>

      <MatrixTable matrix={matrix} audit={audit} />
      <MatrixLegend />

      <div className="mt-8">
        <PendingUpdatesPanel suggestions={suggestions} />
      </div>
    </div>
  );
}
