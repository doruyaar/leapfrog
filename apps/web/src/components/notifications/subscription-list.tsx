import { Power, Trash2 } from 'lucide-react';
import { describeSubscription, type SubscriptionView } from '@leapfrog/core';
import { deleteSubscriptionAction, toggleSubscriptionAction } from '@/lib/actions';
import { CATEGORY_COLOR, relativeAge } from '@/lib/format';
import { TestButton } from './test-button';

const FREQUENCY_LABEL: Record<SubscriptionView['frequency'], string> = {
  immediate: 'Immediately',
  daily: 'Daily digest',
  weekly: 'Weekly digest',
};

/** The saved rules, each with its plain-English scope and per-rule controls. */
export function SubscriptionList({
  subscriptions,
}: {
  subscriptions: SubscriptionView[];
}) {
  if (subscriptions.length === 0) {
    return (
      <p className="border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-faint">
        No subscriptions yet. Create one above to start getting alerts by email.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {subscriptions.map((sub) => (
        <li
          key={sub.id}
          className="border border-line bg-card p-4"
          style={{ borderLeft: `3px solid ${sub.enabled ? '#0f7d3d' : '#9aa0a6'}` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-ink-strong">{sub.label}</h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    sub.enabled
                      ? 'border-[#0f7d3d]/40 bg-[#0f7d3d]/10 text-[#0f7d3d]'
                      : 'border-line text-ink-faint'
                  }`}
                >
                  {sub.enabled ? 'Active' : 'Paused'}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-dim">
                {describeSubscription(sub)}.
              </p>
              <p className="mt-0.5 text-[12px] text-ink-faint">
                {sub.email} · {FREQUENCY_LABEL[sub.frequency]}
                {sub.lastNotifiedAt
                  ? ` · last sent ${relativeAge(sub.lastNotifiedAt)}`
                  : ' · not sent yet'}
              </p>
            </div>
          </div>

          {(sub.categories.length > 0 || sub.keywords.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {sub.categories.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-dim"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: CATEGORY_COLOR[c] }}
                  />
                  {c}
                </span>
              ))}
              {sub.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-ink-dim"
                >
                  “{k}”
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3">
            <TestButton subscriptionId={sub.id} />

            <form action={toggleSubscriptionAction} className="ml-auto">
              <input type="hidden" name="id" value={sub.id} />
              <input type="hidden" name="enabled" value={sub.enabled ? '0' : '1'} />
              <button
                type="submit"
                className="inline-flex h-[30px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-accent"
              >
                <Power className="size-3.5" />
                {sub.enabled ? 'Pause' : 'Resume'}
              </button>
            </form>

            <form action={deleteSubscriptionAction}>
              <input type="hidden" name="id" value={sub.id} />
              <button
                type="submit"
                className="inline-flex h-[30px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[12px] text-ink-dim transition-colors hover:border-[#c9302c] hover:text-[#c9302c]"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
