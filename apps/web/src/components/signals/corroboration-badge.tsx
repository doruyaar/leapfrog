import Link from 'next/link';
import { ShieldCheck, ShieldQuestion, Users } from 'lucide-react';
import type { Corroboration } from '@/lib/queries';
import { relativeAge } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Plain-words render config per verdict — no invented terminology. */
const STATUS_STYLE: Record<
  Corroboration['status'],
  { label: string; className: string; icon: 'check' | 'users' | 'question' }
> = {
  'primary-source': {
    label: 'Primary source',
    className: 'border-[#3bc03f]/40 bg-[#3bc03f]/10 text-[#2a8a2e]',
    icon: 'check',
  },
  'primary-confirmed': {
    label: 'Confirmed by primary source',
    className: 'border-[#3bc03f]/40 bg-[#3bc03f]/10 text-[#2a8a2e]',
    icon: 'check',
  },
  'secondary-corroborated': {
    label: 'Corroborated by other sources',
    className: 'border-[#2f78d1]/40 bg-[#2f78d1]/10 text-[#2f78d1]',
    icon: 'users',
  },
  'single-source': {
    label: 'Single secondary source',
    className: 'border-[#d9a521]/50 bg-[#d9a521]/10 text-[#a67c14]',
    icon: 'question',
  },
};

function StatusIcon({ icon }: { icon: 'check' | 'users' | 'question' }) {
  const cls = 'size-3.5';
  if (icon === 'check') return <ShieldCheck className={cls} />;
  if (icon === 'users') return <Users className={cls} />;
  return <ShieldQuestion className={cls} />;
}

/** The compact pill for cards: the verdict in plain words. */
export function CorroborationBadge({ status }: { status: Corroboration['status'] }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        style.className,
      )}
    >
      <StatusIcon icon={style.icon} />
      {style.label}
    </span>
  );
}

/**
 * The expanded panel for the signal detail view: the verdict plus the actual
 * corroborating items with their tier labels, each a link — grounding tells you
 * where a claim came from; this tells you whether to trust it.
 */
export function CorroborationPanel({
  corroboration,
  signalId,
}: {
  corroboration: Corroboration;
  signalId: number;
}) {
  const { status, corroborators } = corroboration;

  return (
    <div>
      <CorroborationBadge status={status} />
      {corroborators.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {corroborators
            .filter((c) => c.rawItemId !== signalId)
            .map((c) => (
              <li key={c.rawItemId}>
                <Link
                  href={`/signals/${c.rawItemId}`}
                  className="block text-[12.5px] leading-snug text-ink hover:text-accent"
                >
                  {c.title}
                </Link>
                <span className="text-[11px] text-ink-faint">
                  {c.sourceName} ·{' '}
                  <span
                    className={cn(
                      'font-medium',
                      c.tier === 'primary' ? 'text-[#2a8a2e]' : 'text-ink-dim',
                    )}
                  >
                    {c.tier} source
                  </span>{' '}
                  · {relativeAge(c.publishedAt)}
                </span>
              </li>
            ))}
        </ul>
      )}
      {corroborators.length === 0 && status === 'single-source' && (
        <p className="mt-2 text-[11.5px] text-ink-faint">
          No other tracked source tells this story yet.
        </p>
      )}
    </div>
  );
}
