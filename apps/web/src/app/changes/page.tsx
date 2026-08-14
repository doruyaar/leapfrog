import type { Metadata } from 'next';
import { ArrowRightLeft } from 'lucide-react';
import { CHANGE_KINDS, DIMENSIONS } from '@leapfrog/core';
import {
  getChangesFeed,
  type ChangeKind,
  type ChangeSort,
  type Dimension,
  type SortDir,
} from '@/lib/queries';
import { firstValue, oneOf, parsePage, type RawSearchParams } from '@/lib/list-params';
import { ChangeCard, FilteredChangesRow } from '@/components/changes/change-card';
import { EmptyState } from '@/components/ui/empty-state';
import { NoResults } from '@/components/ui/no-results';
import { ListToolbar, type SelectFilter } from '@/components/ui/list-toolbar';
import { Pagination } from '@/components/ui/pagination';

export const metadata: Metadata = { title: 'Changes' };
export const dynamic = 'force-dynamic';

const BASE_PATH = '/changes';

/** Sort menu: each value encodes `key:dir`; the first is the URL-less default. */
const SORT_OPTIONS = [
  { value: 'published:desc', label: 'Newest first' },
  { value: 'published:asc', label: 'Oldest first' },
  { value: 'materiality:desc', label: 'Most material' },
  { value: 'materiality:asc', label: 'Least material' },
];
const DEFAULT_SORT = 'published:desc';

/** Kind filter. The blank/default option ("Material") is real movement, not re-wordings. */
const KIND_OPTIONS = [
  { value: 'all', label: 'All kinds' },
  { value: 'new', label: 'New developments' },
  { value: 'update', label: 'State changes' },
  { value: 'rephrase', label: 'Re-phrasings' },
  { value: 'duplicate', label: 'Duplicates' },
];

const DIMENSION_LABEL = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;

  const q = firstValue(sp, 'q');
  const vendor = firstValue(sp, 'vendor');
  const dimension = oneOf<Dimension>(firstValue(sp, 'dimension'), DIMENSIONS);
  const kindParam = firstValue(sp, 'kind');
  const kind = oneOf<ChangeKind>(kindParam, CHANGE_KINDS);
  const sort = oneOf<ChangeSort>(firstValue(sp, 'sort'), ['published', 'materiality']);
  const dir = oneOf<SortDir>(firstValue(sp, 'dir'), ['asc', 'desc']);
  const page = parsePage(firstValue(sp, 'page'));

  // Default (no `kind`) = material only; explicit `all` widens to every kind.
  const kinds = kindParam === 'all' ? [...CHANGE_KINDS] : kind ? [kind] : undefined;

  const feed = getChangesFeed({ q, vendor, dimension, kinds, sort, dir, page });
  const { result, vendors, noise, isFiltered } = feed;

  const composedSort = `${sort ?? 'published'}:${dir ?? 'desc'}`;
  const activeSort = SORT_OPTIONS.some((o) => o.value === composedSort)
    ? composedSort
    : DEFAULT_SORT;

  const params: Record<string, string | undefined> = {
    q,
    vendor,
    dimension,
    kind: kindParam === 'all' ? 'all' : kind,
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
    {
      name: 'dimension',
      label: 'Dimension',
      allLabel: 'All dimensions',
      options: DIMENSIONS.map((d) => ({ value: d, label: DIMENSION_LABEL(d) })),
    },
    {
      name: 'kind',
      label: 'Kind',
      allLabel: 'Material (new + updates)',
      options: KIND_OPTIONS,
    },
  ];

  const corpusEmpty = !isFiltered && result.total === 0 && noise.length === 0;

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <ArrowRightLeft className="size-6 text-accent" strokeWidth={1.7} />
          Changes
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          What actually changed in each vendor&apos;s state — compared to what we knew
          before. Re-wordings of known facts are collapsed, not counted.
        </p>
      </div>

      {corpusEmpty ? (
        <EmptyState
          title="No change events yet"
          hint="Load the demo snapshot (it includes revised and re-published items), or run the diff stage after your next ingest."
          command="npm run seed"
        />
      ) : (
        <div className="max-w-[880px]">
          <ListToolbar
            noun="change"
            filters={filters}
            sort={{
              options: SORT_OPTIONS,
              active: activeSort,
              defaultValue: DEFAULT_SORT,
            }}
          />

          {noise.length > 0 && (
            <div className="mb-4">
              <FilteredChangesRow events={noise} />
            </div>
          )}

          {result.total === 0 ? (
            isFiltered ? (
              <NoResults noun="change" resetHref={BASE_PATH} />
            ) : null
          ) : (
            <div className="space-y-4">
              {result.items.map((event) => (
                <ChangeCard key={event.id} event={event} />
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
            noun="change"
          />
        </div>
      )}
    </div>
  );
}
