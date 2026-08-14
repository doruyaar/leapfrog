import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ExternalLink } from 'lucide-react';
import {
  getChangeEvent,
  getCorroboration,
  getRelatedSignals,
  getSignal,
} from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { CategoryBadge, ImpactBadge, VendorMark } from '@/components/signals/badges';
import { CorroborationPanel } from '@/components/signals/corroboration-badge';
import { StateChangeBadge } from '@/components/signals/signal-card';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const signal = getSignal(Number(id));
  return { title: signal ? signal.title : 'Signal' };
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[3px] border border-line bg-canvas px-2 py-0.5 text-[12px] text-ink-dim">
      {children}
    </span>
  );
}

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const signal = getSignal(Number(id));

  if (!signal) {
    return (
      <div className="px-[34px] pb-11 pt-5">
        <BackLink />
        <EmptyState
          title="Signal not found"
          hint="This signal is not in the current corpus. It may not have been seeded, or it was quarantined during enrichment."
          command="npm run seed"
        />
      </div>
    );
  }

  const related = getRelatedSignals(signal.id, signal.vendor);
  const changeEvent = getChangeEvent(signal.id);
  const corroboration = getCorroboration(signal.id);
  const materialChange =
    changeEvent !== null &&
    (changeEvent.kind === 'new' || changeEvent.kind === 'update') &&
    changeEvent.materiality >= 4;

  return (
    <div className="px-[34px] pb-11 pt-5">
      <BackLink />

      <article className="border border-line bg-card">
        <div className="border-b border-line px-7 py-6">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <CategoryBadge category={signal.category} />
            <ImpactBadge score={signal.impactScore} showLabel />
            {materialChange && <StateChangeBadge />}
            <span className="text-[12px] text-ink-faint">
              {signal.sourceName} · {signal.sourceKind.toUpperCase()} ·{' '}
              {formatDate(signal.publishedAt)}
            </span>
          </div>
          <h1 className="text-[24px] font-normal leading-snug text-ink-strong">
            {signal.title}
          </h1>
          <div className="mt-4 flex items-center gap-2.5">
            <VendorMark vendor={signal.vendor} />
            <span className="text-[13px] text-ink">{signal.vendor ?? 'Market-wide'}</span>
            {signal.author && (
              <span className="text-[12px] text-ink-faint">· by {signal.author}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-7 px-7 py-6 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            <div className="border-l-2 border-accent bg-accent-soft px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                Why it matters
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-ink">
                {signal.whyItMatters}
              </p>
            </div>

            {changeEvent && changeEvent.before !== null && (
              <>
                <Section title="Compared to previous state" />
                <div className="space-y-1.5">
                  <blockquote className="border-l-2 border-line px-3 py-1.5 text-[13px] leading-snug text-ink-faint">
                    <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider">
                      Before
                    </span>
                    “{changeEvent.before}”
                  </blockquote>
                  <div className="flex justify-start pl-3 text-ink-faint">
                    <ArrowDown className="size-3.5" />
                  </div>
                  <blockquote className="border-l-2 border-accent bg-accent-soft px-3 py-1.5 text-[13px] leading-snug text-ink">
                    <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                      After
                    </span>
                    “{changeEvent.after}”
                  </blockquote>
                  {changeEvent.rationale && (
                    <p className="text-[11.5px] italic text-ink-faint">
                      {changeEvent.rationale} · {changeEvent.model} ·{' '}
                      {changeEvent.promptVersion}
                    </p>
                  )}
                </div>
              </>
            )}

            <Section title="Summary" />
            <p className="text-[14px] leading-relaxed text-ink">{signal.summary}</p>
            {signal.rationale && (
              <p className="mt-2 text-[12.5px] italic text-ink-dim">
                Impact rationale: {signal.rationale}
              </p>
            )}

            <Section title="Source content" />
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-dim">
              {signal.content}
            </p>

            <a
              href={signal.url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 text-[13px] text-accent hover:underline"
            >
              <ExternalLink className="size-4" />
              View original source
            </a>
          </div>

          <aside className="space-y-6">
            {corroboration && (
              <div>
                <SideTitle>Corroboration</SideTitle>
                <CorroborationPanel corroboration={corroboration} signalId={signal.id} />
              </div>
            )}

            {(signal.vendors.length > 0 || signal.products.length > 0) && (
              <div>
                <SideTitle>Entities</SideTitle>
                <div className="flex flex-wrap gap-1.5">
                  {signal.vendors.map((v) => (
                    <Chip key={`v-${v}`}>{v}</Chip>
                  ))}
                  {signal.products.map((p) => (
                    <Chip key={`p-${p}`}>{p}</Chip>
                  ))}
                </div>
              </div>
            )}

            {related.length > 0 && (
              <div>
                <SideTitle>Related — {signal.vendor}</SideTitle>
                <ul className="space-y-2.5">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/signals/${r.id}`}
                        className="block text-[12.5px] leading-snug text-ink hover:text-accent"
                      >
                        {r.title}
                      </Link>
                      <span className="text-[11px] text-ink-faint">
                        Impact {r.impactScore} · {formatDate(r.publishedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <SideTitle>Provenance</SideTitle>
              <dl className="space-y-1 text-[11.5px] text-ink-faint">
                <ProvRow label="Model" value={signal.model} />
                <ProvRow label="Prompt" value={signal.promptVersion} />
                <ProvRow label="Enriched" value={formatDate(signal.createdAt)} />
              </dl>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/briefs"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-dim hover:text-accent"
    >
      <ArrowLeft className="size-4" />
      Back to brief
    </Link>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-3">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function SideTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
      {children}
    </div>
  );
}

function ProvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="truncate text-ink-dim">{value}</dd>
    </div>
  );
}
