import Link from 'next/link';
import type { CellLevel, ComparisonMatrix } from '@leapfrog/core';
import { cn } from '@/lib/utils';

/** Level → dot colour + label. `none` reads as a gap; `info` is neutral (nuance, not a score). */
const LEVEL_STYLE: Record<CellLevel, { dot: string; label: string }> = {
  strong: { dot: 'bg-[#3bc03f]', label: 'Strong' },
  partial: { dot: 'bg-[#d9a521]', label: 'Partial' },
  none: { dot: 'bg-[#c9302c]', label: 'Gap' },
  info: { dot: 'bg-[#6b93b8]', label: 'Varies' },
};

/**
 * The curated capability grid: axes down the left, vendors across the top. The focus
 * vendor's column is tinted so the table reads as "us vs. the field". Each cell carries a
 * coverage dot (strong/partial/gap/varies) plus the human-written note behind it.
 */
export function MatrixTable({ matrix }: { matrix: ComparisonMatrix }) {
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
              <th
                scope="row"
                className="sticky left-0 z-10 bg-card px-4 py-3 align-top"
                title={axis.description}
              >
                <div className="text-[13px] font-medium text-ink-strong">
                  {axis.label}
                </div>
                <div className="mt-0.5 max-w-[180px] text-[11px] font-normal text-ink-faint">
                  {axis.description}
                </div>
              </th>
              {matrix.vendors.map((vendor) => {
                const cell = axis.cells[vendor.name];
                const level: CellLevel = cell?.level ?? 'none';
                const style = LEVEL_STYLE[level];
                const isFocus = vendor.name === matrix.focusVendor;
                return (
                  <td
                    key={vendor.slug}
                    className={cn('px-4 py-3 align-top', isFocus && 'bg-accent-soft/40')}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn('mt-1 size-2 shrink-0 rounded-full', style.dot)}
                        title={style.label}
                      />
                      <span className="text-[12.5px] leading-snug text-ink">
                        {cell?.note ?? '—'}
                      </span>
                    </div>
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

/** Legend for the coverage dots, shown under the table. */
export function MatrixLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-ink-dim">
      {(Object.keys(LEVEL_STYLE) as CellLevel[]).map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', LEVEL_STYLE[level].dot)} />
          {LEVEL_STYLE[level].label}
        </span>
      ))}
    </div>
  );
}
