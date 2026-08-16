import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldHalf, ArrowUpRight } from 'lucide-react';
import { getBattlecardVendors, FOCUS_VENDOR } from '@/lib/queries';
import { VendorMark } from '@/components/signals/badges';

export const metadata: Metadata = { title: 'Battlecards' };
export const dynamic = 'force-dynamic';

export default function BattlecardsPage() {
  const vendors = getBattlecardVendors();

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <ShieldHalf className="size-6 text-accent" strokeWidth={1.7} />
          Battlecards
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          {FOCUS_VENDOR} vs. each competitor — composed from the competitive matrix and
          the live corpus, exportable to Markdown.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vendors.map((vendor) => (
          <Link
            key={vendor.slug}
            href={`/battlecards/${vendor.slug}`}
            className="group relative flex items-center gap-3 border border-line bg-card p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.10)]"
          >
            <VendorMark vendor={vendor.name} className="size-[34px] text-[12px]" />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-ink-strong group-hover:text-accent">
                {FOCUS_VENDOR} vs. {vendor.name}
              </div>
              <div className="text-[11px] text-ink-faint">Open battlecard</div>
            </div>
            <ArrowUpRight className="ml-auto size-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}
