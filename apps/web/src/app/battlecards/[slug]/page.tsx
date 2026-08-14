import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Swords,
  ShieldAlert,
  Scale,
  MessageSquareQuote,
} from 'lucide-react';
import { getBattlecard } from '@/lib/queries';
import { refreshBattlecardAction } from '@/lib/actions';
import { formatDate, relativeAge } from '@/lib/format';
import { VendorMark } from '@/components/signals/badges';
import { CitedText } from '@/components/signals/cited-text';
import { EmptyState } from '@/components/ui/empty-state';
import { ExportButton } from '@/components/battlecards/export-button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await getBattlecard(slug);
  return {
    title: view ? `${view.card.focusVendor} vs. ${view.card.vendor}` : 'Battlecard',
  };
}

function BackLink() {
  return (
    <Link
      href="/battlecards"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-dim transition-colors hover:text-accent"
    >
      <ArrowLeft className="size-4" />
      All battlecards
    </Link>
  );
}

export default async function BattlecardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await getBattlecard(slug);

  if (!view) {
    return (
      <div className="px-[34px] pb-11 pt-5">
        <BackLink />
        <EmptyState
          title="Battlecard unavailable"
          hint="Either this competitor is not in the comparison matrix, or the corpus is empty. Load the demo snapshot and try again."
          command="npm run seed"
        />
      </div>
    );
  }

  const { card, markdown } = view;
  const filename = `battlecard-${card.focusVendor}-vs-${card.vendor}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  return (
    <div className="px-[34px] pb-11 pt-5">
      <BackLink />

      <div className="mb-5 flex items-start gap-4">
        <VendorMark vendor={card.vendor} className="size-[46px] text-[16px]" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2.5 text-[26px] font-normal text-ink-strong">
            <span className="text-accent">{card.focusVendor}</span>
            <Swords className="size-5 text-ink-faint" />
            {card.vendor}
          </h1>
          <p className="mt-1 text-[13px] text-ink-dim">
            {view.stored ? 'Generated' : 'Composed live'} {formatDate(card.generatedAt)} (
            {relativeAge(card.generatedAt)}) · {card.recentSignals.length} tracked signal
            {card.recentSignals.length === 1 ? '' : 's'}
          </p>
        </div>
        <ExportButton markdown={markdown} filename={`${filename}.md`} />
      </div>

      {view.stored && view.newSignals > 0 && (
        <div className="mb-6 flex items-center justify-between gap-4 border border-[#d9a521]/50 bg-[#d9a521]/10 px-5 py-3.5">
          <p className="text-[13.5px] text-ink">
            <span className="font-semibold">
              {view.newSignals} new signal{view.newSignals === 1 ? '' : 's'}
            </span>{' '}
            since this card was generated — the card below may be stale.
          </p>
          <form action={refreshBattlecardAction}>
            <input type="hidden" name="vendor" value={card.vendor} />
            <input type="hidden" name="slug" value={slug} />
            <button
              type="submit"
              className="inline-flex h-[32px] items-center gap-1.5 rounded-[4px] bg-accent px-3 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
          </form>
        </div>
      )}

      <section className="mb-6 border border-line bg-card p-5">
        <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Positioning
        </h2>
        <CitedText text={card.summary} className="text-[15px] leading-relaxed text-ink" />
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EdgeColumn
          title={`Where ${card.focusVendor} wins`}
          icon={<Swords className="size-4 text-accent" />}
          edges={card.ourStrengths}
          side="ours"
          emptyLabel="No differentiated advantage in the current matrix."
        />
        <EdgeColumn
          title={`Watch-outs (${card.vendor})`}
          icon={<ShieldAlert className="size-4 text-[#c9302c]" />}
          edges={card.theirStrengths}
          side="theirs"
          emptyLabel="No competitor advantage flagged in the current matrix."
        />
      </div>

      {card.parity.length > 0 && (
        <section className="mb-6 border border-line bg-card px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
            <Scale className="size-4" /> At parity — expect objections
          </h2>
          <div className="flex flex-wrap gap-2">
            {card.parity.map((edge) => (
              <span
                key={edge.axisId}
                className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-dim"
              >
                {edge.axisLabel}
              </span>
            ))}
          </div>
        </section>
      )}

      {card.talkingPoints.length > 0 && (
        <section className="mb-6 border border-line bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
            <MessageSquareQuote className="size-4 text-accent" /> Talking points
          </h2>
          <ul className="space-y-2">
            {card.talkingPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] text-ink">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                <CitedText text={point} className="text-[13.5px] text-ink" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Recent activity
        </h2>
        {card.recentSignals.length === 0 ? (
          <p className="border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-faint">
            No tracked signals for {card.vendor} yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {card.recentSignals.map((signal) => (
              <li key={signal.id}>
                <Link
                  href={`/signals/${signal.id}`}
                  className="group flex items-start gap-3 border border-line bg-card px-4 py-3 transition-colors hover:border-accent"
                >
                  <span className="mt-0.5 rounded-[3px] bg-canvas px-1.5 text-[11px] font-medium text-ink-faint">
                    #{signal.id}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-ink-strong group-hover:text-accent">
                      {signal.title}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-dim">
                      {signal.summary}
                    </p>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-faint">
                    {relativeAge(signal.publishedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface Edge {
  axisId: string;
  axisLabel: string;
  ourNote: string;
  theirNote: string;
}

function EdgeColumn({
  title,
  icon,
  edges,
  side,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  edges: Edge[];
  side: 'ours' | 'theirs';
  emptyLabel: string;
}) {
  return (
    <section className="border border-line bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
        {icon} {title}
      </h2>
      {edges.length === 0 ? (
        <p className="text-[13px] text-ink-faint">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {edges.map((edge) => (
            <li key={edge.axisId}>
              <div className="text-[13px] font-medium text-ink-strong">
                {edge.axisLabel}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink">
                {side === 'ours' ? edge.ourNote : edge.theirNote}
              </div>
              <div className="mt-0.5 text-[11.5px] text-ink-faint">
                {side === 'ours'
                  ? `vs. ${edge.theirNote}`
                  : `our position: ${edge.ourNote}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
