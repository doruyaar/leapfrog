import type { Category } from '@leapfrog/core';
import { CATEGORY_COLOR, impactColor, impactLabel, vendorInitials } from '@/lib/format';
import { vendorLogo } from '@/lib/vendor-logos';
import { cn } from '@/lib/utils';

/** Category pill with a colour dot — the same colour used for card accents. */
export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-dim">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: CATEGORY_COLOR[category] }}
      />
      {category}
    </span>
  );
}

/** Square impact chip (1–5), optionally with its rubric label ("Act now", …). */
export function ImpactBadge({
  score,
  showLabel = false,
}: {
  score: number;
  showLabel?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="grid size-[26px] place-items-center rounded-[4px] text-[13px] font-semibold text-white"
        style={{ backgroundColor: impactColor(score) }}
        title={`Impact ${score} — ${impactLabel(score)}`}
      >
        {score}
      </span>
      {showLabel && (
        <span className="text-[12px] text-ink-dim">{impactLabel(score)}</span>
      )}
    </span>
  );
}

/**
 * Vendor mark: the company's brand logo on its brand colour when we have one,
 * otherwise a two-letter initial on neutral chrome fill (so the category colour
 * stays meaningful for vendors without a bundled logo).
 */
export function VendorMark({
  vendor,
  className,
}: {
  vendor: string | null;
  className?: string;
}) {
  const logo = vendorLogo(vendor);
  if (logo) {
    return (
      <span
        className={cn(
          'grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-[4px]',
          className,
        )}
        style={{ backgroundColor: logo.bg }}
        title={logo.title}
      >
        {logo.node}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'grid size-[30px] shrink-0 place-items-center rounded-[4px] bg-chrome text-[11px] font-bold text-white',
        className,
      )}
    >
      {vendorInitials(vendor)}
    </span>
  );
}
