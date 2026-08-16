import type { Metadata } from 'next';
import { Rss } from 'lucide-react';
import { CATEGORIES } from '@leapfrog/core';
import {
  getSignalsFeed,
  type Category,
  type SignalSort,
  type SortDir,
} from '@/lib/queries';
import { CATEGORY_COLOR } from '@/lib/format';
import { firstValue, oneOf, parsePage, type RawSearchParams } from '@/lib/list-params';
import { SignalCard } from '@/components/signals/signal-card';
import { SubscribeLink } from '@/components/notifications/subscribe-link';
import { EmptyState } from '@/components/ui/empty-state';
import { NoResults } from '@/components/ui/no-results';
import { ListToolbar, type SelectFilter } from '@/components/ui/list-toolbar';
import { Pagination } from '@/components/ui/pagination';

export const metadata: Metadata = { title: 'Insights' };
export const dynamic = 'force-dynamic';

const BASE_PATH = '/insights';

/** Sort menu: each value encodes `key:dir`; the first is the URL-less default. */
const SORT_OPTIONS = [
  { value: 'published:desc', label: 'Newest first' },
  { value: 'published:asc', label: 'Oldest first' },
  { value: 'impact:desc', label: 'Highest impact' },
  { value: 'impact:asc', label: 'Lowest impact' },
  { value: 'title:asc', label: 'Title A–Z' },
];
const DEFAULT_SORT = 'published:desc';

/** Impact filter: an at-or-above threshold, hottest first. */
const IMPACT_OPTIONS = [
  { value: '5', label: 'Act now (5)' },
  { value: '4', label: 'High (4+)' },
  { value: '3', label: 'Medium (3+)' },
  { value: '2', label: 'Low (2+)' },
];

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;

  const q = firstValue(sp, 'q');
  const category = oneOf(firstValue(sp, 'category'), CATEGORIES);
  const vendor = firstValue(sp, 'vendor');
  const impactRaw = firstValue(sp, 'impact');
  const impactMin =
    impactRaw && /^[2-5]$/.test(impactRaw) ? Number(impactRaw) : undefined;
  const sort = oneOf<SignalSort>(firstValue(sp, 'sort'), [
    'published',
    'impact',
    'title',
  ]);
  const dir = oneOf<SortDir>(firstValue(sp, 'dir'), ['asc', 'desc']);
  const page = parsePage(firstValue(sp, 'page'));

  const feed = getSignalsFeed({
    q,
    category,
    vendor,
    impactMin,
    sort,
    dir,
    page,
  });
  const { result, breakdown, vendors, activeCategory, isFiltered } = feed;

  const composedSort = `${sort ?? 'published'}:${dir ?? 'desc'}`;
  const activeSort = SORT_OPTIONS.some((o) => o.value === composedSort)
    ? composedSort
    : DEFAULT_SORT;

  // Params the pager must preserve — normalized so links stay clean (defaults dropped).
  const params: Record<string, string | undefined> = {
    q,
    category,
    vendor,
    impact: impactMin ? String(impactMin) : undefined,
    sort: activeSort === DEFAULT_SORT ? undefined : sort,
    dir: activeSort === DEFAULT_SORT ? undefined : dir,
  };

  const filters: SelectFilter[] = [
    {
      name: 'vendor',
      label: 'Vendor',
      allLabel: 'All vendors',
      options: vendors.map((v) => ({ value: v, label: v })),
    },
    { name: 'impact', label: 'Impact', allLabel: 'Any impact', options: IMPACT_OPTIONS },
  ];

  const facetTotal = breakdown.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
            <Rss className="size-6 text-accent" strokeWidth={1.7} />
            Insights
          </h1>
          <p className="mt-1 text-[13px] text-ink-dim">
            Every enriched, scored item in the corpus — search, filter, and sort to find
            what matters.
          </p>
        </div>
        {isFiltered && (
          <SubscribeLink
            className="mt-1"
            vendor={vendor}
            category={activeCategory}
            impact={impactMin}
            keyword={q}
          >
            Subscribe to these results
          </SubscribeLink>
        )}
      </div>

      {!isFiltered && result.total === 0 ? (
        <EmptyState
          title="No insights yet"
          hint="Load the demo snapshot to populate the feed. No API key needed."
          command="npm run seed"
        />
      ) : (
        <>
          <ListToolbar
            noun="insight"
            filters={filters}
            sort={{
              options: SORT_OPTIONS,
              active: activeSort,
              defaultValue: DEFAULT_SORT,
            }}
            category={{
              param: 'category',
              active: activeCategory,
              total: facetTotal,
              breakdown: breakdown.map((b) => ({
                value: b.category,
                count: b.count,
                color: CATEGORY_COLOR[b.category as Category],
              })),
            }}
          />

          {result.total === 0 ? (
            <NoResults noun="insight" resetHref={BASE_PATH} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.items.map((signal) => (
                <SignalCard key={signal.id} signal={signal} />
              ))}
            </div>
          )}

          <Pagination
            basePath={BASE_PATH}
            params={params}
            page={result.page}
            totalPages={result.totalPages}
            from={result.from}
            to={result.to}
            total={result.total}
            noun="insight"
          />
        </>
      )}
    </div>
  );
}
