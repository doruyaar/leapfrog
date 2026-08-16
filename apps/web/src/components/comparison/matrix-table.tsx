import Link from 'next/link';
import type { CellLevel, ComparisonMatrix } from '@leapfrog/core';
import type { CellExplainabilityView } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { MatrixCell } from './matrix-cell';
import { LEVEL_STYLE } from './matrix-visuals';

/**
 * The curated capability grid: axes down the left, vendors across the top. The focus
 * vendor's column is tinted so the table reads as "us vs. the field". To stay scannable
 * at a glance, each cell shows only its coverage rating (a coloured dot + one word); the
 * human-written note, the confidence, when it was last updated, and the supporting
 * evidence are one click away in the cell's popover — so the table never overloads while
 * every rating stays fully explainable.
 */
export function MatrixTable({
  matrix,
  explain,
  ratedVendors,
}: {
  matrix: ComparisonMatrix;
  explain: Record<string, CellExplainabilityView>;
  /**
   * Vendor names that have curated ratings. A column not in this set was added to the
   * grid by the reader (a company we track but haven't rated), so its cells read "not
   * rated" rather than a misleading "Gap". Defaults to every column being rated.
   */
  ratedVendors?: ReadonlySet<string>;
}) {
  return (
    <div className="overflow-x-auto border border-line bg-card">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-card px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
              Capability
            </th>
            {matrix.vendors.map((vendor) => {
              const isFocus = vendor.name === matrix.focusVendor;
              return (
                <th
                  key={vendor.slug}
                  className={cn(
                    'px-4 py-3 text-[13px] font-semibold',
                    isFocus ? 'bg-accent-soft text-accent' : 'text-ink-strong',
                  )}
                >
                  <Link
                    href={`/competitors/${vendor.slug}`}
                    className="hover:underline"
                    title={`Open ${vendor.name}`}
                  >
                    {vendor.name}
                  </Link>
                  {isFocus && <span className="ml-1 text-[10px]">(focus)</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {matrix.axes.map((axis) => (
            <tr key={axis.id} className="border-b border-line-soft last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-3 align-top">
                <div className="text-[13px] font-medium text-ink-strong">
                  {axis.label}
                </div>
                <div className="mt-0.5 max-w-[180px] text-[11px] font-normal text-ink-faint">
                  {axis.description}
                </div>
              </th>
              {matrix.vendors.map((vendor) => {
                const isFocus = vendor.name === matrix.focusVendor;
                const isRated = !ratedVendors || ratedVendors.has(vendor.name);
                const key = `${vendor.name}::${axis.id}`;
                const detail =
                  explain[key] ?? fallbackDetail(matrix, axis.id, vendor.name);
                return (
                  <td
                    key={vendor.slug}
                    className={cn(
                      'px-2 py-1.5 align-middle',
                      isFocus && 'bg-accent-soft/40',
                    )}
                  >
                    {isRated ? (
                      <MatrixCell detail={detail} isFocus={isFocus} />
                    ) : (
                      <NotRatedCell />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A column the reader added that we don't rate on the curated matrix. Shown as an explicit
 * "not rated" placeholder — never a red "Gap" — so an added company is honestly "no
 * curated rating yet", not falsely "lacks this capability".
 */
function NotRatedCell() {
  return (
    <span
      className="flex w-full items-center justify-center rounded-[4px] px-2 py-1.5 text-[12px] text-ink-faint"
      title="Not rated on the curated matrix yet"
    >
      —
    </span>
  );
}

/** A minimal detail when explainability is unavailable (e.g. no database seeded). */
function fallbackDetail(
  matrix: ComparisonMatrix,
  axisId: string,
  vendor: string,
): CellExplainabilityView {
  const axis = matrix.axes.find((a) => a.id === axisId);
  const cell = axis?.cells[vendor];
  return {
    vendor,
    axisId,
    axisLabel: axis?.label ?? axisId,
    level: cell?.level ?? 'none',
    note: cell?.note ?? '—',
    evidence: [],
    evidenceCount: 0,
    confidence: 'low',
    confidenceFactors: {
      evidenceCount: 0,
      maxImpact: 0,
      freshness: 0,
      hasPrimarySource: false,
    },
    lastUpdatedAt: null,
    lastUpdatedSignalId: null,
  };
}

/** Legend for the coverage dots plus a one-line "how to read this" cue. */
export function MatrixLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-ink-dim">
      {(Object.keys(LEVEL_STYLE) as CellLevel[]).map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', LEVEL_STYLE[level].dot)} />
          {LEVEL_STYLE[level].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-ink-faint">
        <span className="size-1.5 rounded-full bg-accent" />
        Recently updated
      </span>
      <span className="text-ink-faint">
        Click any cell for the evidence and confidence behind it.
      </span>
    </div>
  );
}
