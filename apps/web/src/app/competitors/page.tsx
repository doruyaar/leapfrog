import type { Metadata } from 'next';
import { Building2 } from 'lucide-react';
import { getVendors, FOCUS_VENDOR } from '@/lib/queries';
import { EmptyState } from '@/components/ui/empty-state';
import { VendorCard } from '@/components/competitors/vendor-card';

export const metadata: Metadata = { title: 'Competitors' };
export const dynamic = 'force-dynamic';

export default function CompetitorsPage() {
  const vendors = getVendors();

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Building2 className="size-6 text-accent" strokeWidth={1.7} />
          Competitors
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          Every tracked vendor with intelligence in the corpus, busiest first. Open one
          for its timeline and filterable feed.
        </p>
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          title="No competitors yet"
          hint="Load the demo snapshot, then reload — the roster derives itself from the seeded insights. No API key needed."
          command="npm run seed"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vendors.map((vendor) => (
            <VendorCard
              key={vendor.slug}
              vendor={vendor}
              isFocus={vendor.vendor === FOCUS_VENDOR}
            />
          ))}
        </div>
      )}
    </div>
  );
}
