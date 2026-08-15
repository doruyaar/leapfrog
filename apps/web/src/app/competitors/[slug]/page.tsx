import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CATEGORIES } from '@leapfrog/core';
import { getVendorPage, FOCUS_VENDOR, type Category } from '@/lib/queries';
import { formatDate, relativeAge } from '@/lib/format';
import { VendorMark } from '@/components/signals/badges';
import { EmptyState } from '@/components/ui/empty-state';
import { CategoryFilter } from '@/components/competitors/category-filter';
import { VendorTimeline } from '@/components/competitors/vendor-timeline';
import { SubscribeLink } from '@/components/notifications/subscribe-link';

export const dynamic = 'force-dynamic';

/** Narrow a raw query-string value to a valid category, ignoring anything unexpected. */
function parseCategory(value: string | string[] | undefined): Category | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return (CATEGORIES as readonly string[]).includes(raw ?? '')
    ? (raw as Category)
    : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getVendorPage(slug);
  return { title: page ? `${page.vendor.vendor} — Competitor` : 'Competitor' };
}

function BackLink() {
  return (
    <Link
      href="/competitors"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-dim transition-colors hover:text-accent"
    >
      <ArrowLeft className="size-4" />
      All competitors
    </Link>
  );
}

export default async function CompetitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const { slug } = await params;
  const { category } = await searchParams;
  const page = getVendorPage(slug, parseCategory(category));

  if (!page) {
    return (
      <div className="px-[34px] pb-11 pt-5">
        <BackLink />
        <EmptyState
          title="Competitor not found"
          hint="This vendor has no signals in the current corpus. It may not have been seeded yet."
          command="npm run seed"
        />
      </div>
    );
  }

  const { vendor, filtered, breakdown, activeCategory } = page;
  const basePath = `/competitors/${vendor.slug}`;

  return (
    <div className="px-[34px] pb-11 pt-5">
      <BackLink />

      <div className="mb-5 flex items-start gap-4">
        <VendorMark vendor={vendor.vendor} className="size-[46px] text-[16px]" />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
            {vendor.vendor}
            {vendor.vendor === FOCUS_VENDOR && (
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent">
                Focus vendor
              </span>
            )}
          </h1>
          <p className="mt-1 text-[13px] text-ink-dim">
            {vendor.signalCount} tracked signal{vendor.signalCount === 1 ? '' : 's'} ·
            peak impact {vendor.maxImpact} · latest {formatDate(vendor.latestAt)} (
            {relativeAge(vendor.latestAt)})
          </p>
        </div>
        <SubscribeLink
          className="ml-auto mt-1"
          variant="solid"
          vendor={vendor.vendor}
          label={`${vendor.vendor} updates`}
        >
          Get email alerts
        </SubscribeLink>
      </div>

      <div className="mb-5">
        <CategoryFilter
          basePath={basePath}
          active={activeCategory}
          breakdown={breakdown}
          total={vendor.signalCount}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
            Timeline
            {activeCategory && (
              <span className="ml-2 font-normal normal-case text-ink-dim">
                · filtered to {activeCategory}
              </span>
            )}
          </h2>
          <VendorTimeline signals={filtered} />
        </section>
      </div>
    </div>
  );
}
