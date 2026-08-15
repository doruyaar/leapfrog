import Link from 'next/link';
import { Bell } from 'lucide-react';
import type { Category } from '@/lib/queries';
import { cn } from '@/lib/utils';

/**
 * A contextual "subscribe to this" link. It carries the current selection (a vendor, a
 * category, an impact floor, a keyword) into the notification form as prefilled state, so
 * a user can turn what they are looking at into an email alert without rebuilding the
 * filters. The form still asks them to confirm and add an email — a couple of mindless,
 * reversible clicks (Krug) rather than one hidden action.
 */
export interface SubscribeLinkProps {
  vendor?: string | null;
  category?: Category | null;
  impact?: number | null;
  keyword?: string | null;
  /** Optional prefilled name; the form derives one from the filters when omitted. */
  label?: string | null;
  variant?: 'solid' | 'outline';
  className?: string;
  children: React.ReactNode;
}

export function SubscribeLink({
  vendor,
  category,
  impact,
  keyword,
  label,
  variant = 'outline',
  className,
  children,
}: SubscribeLinkProps) {
  const params = new URLSearchParams();
  if (vendor) params.set('vendor', vendor);
  if (category) params.set('category', category);
  if (impact) params.set('impact', String(impact));
  if (keyword) params.set('q', keyword);
  if (label) params.set('label', label);

  const qs = params.toString();
  const href = `/notifications${qs ? `?${qs}` : ''}#new-subscription`;

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[4px] text-[12px] font-medium transition-colors',
        variant === 'solid'
          ? 'bg-accent px-3 py-1.5 text-white transition-opacity hover:opacity-90'
          : 'border border-line px-2.5 py-1.5 text-ink-dim hover:border-accent hover:text-accent',
        className,
      )}
    >
      <Bell className="size-3.5" />
      {children}
    </Link>
  );
}
