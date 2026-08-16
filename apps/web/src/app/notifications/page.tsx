import type { Metadata } from 'next';
import { Bell } from 'lucide-react';
import { CATEGORIES } from '@leapfrog/core';
import { getSubscriptionFacets, getSubscriptions, type Category } from '@/lib/queries';
import { getDb } from '@/lib/db';
import { firstValue, oneOf, type RawSearchParams } from '@/lib/list-params';
import { EmptyState } from '@/components/ui/empty-state';
import {
  SubscriptionForm,
  type SubscriptionFormInitial,
} from '@/components/notifications/subscription-form';
import { SubscriptionList } from '@/components/notifications/subscription-list';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/** Read prefill filters carried in from a "subscribe to this" link elsewhere. */
function readInitial(sp: RawSearchParams): {
  initial: SubscriptionFormInitial;
  prefilled: boolean;
} {
  const vendor = firstValue(sp, 'vendor');
  const category = oneOf(firstValue(sp, 'category'), CATEGORIES);
  const impactRaw = firstValue(sp, 'impact');
  const impact = impactRaw && /^[2-5]$/.test(impactRaw) ? impactRaw : undefined;
  const keywords = firstValue(sp, 'q');
  const label = firstValue(sp, 'label');

  const initial: SubscriptionFormInitial = {
    vendors: vendor ? [vendor] : [],
    categories: category ? [category as Category] : [],
    impact,
    keywords,
    label,
  };
  const prefilled = Boolean(vendor || category || impact || keywords);
  return { initial, prefilled };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const { initial, prefilled } = readInitial(sp);

  const hasDb = getDb() !== null;
  const subscriptions = getSubscriptions();
  const facets = getSubscriptionFacets();

  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="mb-5">
        <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
          <Bell className="size-6 text-accent" strokeWidth={1.7} />
          Notifications
        </h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          Get an email when the market moves — subscribe to exactly the companies, update
          types, severity, and keywords you care about.
        </p>
      </div>

      {!hasDb ? (
        <EmptyState
          title="No insights to subscribe to yet"
          hint="Load the demo snapshot first, then create a subscription. No API key needed."
          command="npm run seed"
        />
      ) : (
        <div className="max-w-3xl space-y-8">
          <section id="new-subscription" className="scroll-mt-6">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
              New subscription
            </h2>
            {prefilled && (
              <p className="mb-3 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-[12.5px] text-accent">
                Prefilled from your selection — review below, add your email, and save.
              </p>
            )}
            <SubscriptionForm facets={facets} initial={initial} />
          </section>

          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
              Your subscriptions
              {subscriptions.length > 0 && (
                <span className="ml-1.5 text-ink-faint">({subscriptions.length})</span>
              )}
            </h2>
            <SubscriptionList subscriptions={subscriptions} />
          </section>
        </div>
      )}
    </div>
  );
}
