import Link from 'next/link';
import type { VendorSummary } from '@/lib/queries';
import { CATEGORY_COLOR, impactColor, relativeAge } from '@/lib/format';
import { VendorMark } from '@/components/signals/badges';

/**
 * One competitor in the index grid: a scannable summary of how much intelligence we hold
 * on a vendor and how hot it is right now (max impact), plus its latest headline. The
 * focus vendor (JFrog) is flagged so the roster reads as "us vs. them".
 */
export function VendorCard({
  vendor,
  isFocus,
}: {
  vendor: VendorSummary;
  isFocus: boolean;
}) {
  return (
    <Link
      href={`/competitors/${vendor.slug}`}
      className="group relative flex flex-col gap-3 border border-line bg-card p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.10)]"
    >
      <div className="flex items-center gap-2.5">
        <VendorMark vendor={vendor.vendor} className="size-[34px] text-[12px]" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-ink-strong group-hover:text-accent">
              {vendor.vendor}
            </span>
            {isFocus && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                Focus
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-faint">
            {vendor.signalCount} insight{vendor.signalCount === 1 ? '' : 's'} ·{' '}
            {relativeAge(vendor.latestAt)}
          </div>
        </div>
        <span
          className="ml-auto grid size-[26px] shrink-0 place-items-center rounded-[4px] text-[13px] font-semibold text-white"
          style={{ backgroundColor: impactColor(vendor.maxImpact) }}
          title={`Peak impact ${vendor.maxImpact}`}
        >
          {vendor.maxImpact}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] text-ink-dim">{vendor.latestTitle}</p>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        {vendor.categories.map((category) => (
          <span
            key={category}
            className="inline-flex items-center gap-1 text-[10.5px] text-ink-faint"
            title={category}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[category] }}
            />
            {category}
          </span>
        ))}
      </div>
    </Link>
  );
}
