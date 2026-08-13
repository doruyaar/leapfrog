import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Thin outlined action button used in the page sub-headers. */
export function OutlineButton({
  icon: Icon,
  children,
  className,
  ...rest
}: ComponentProps<'button'> & { icon?: LucideIcon }) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-[36px] items-center gap-2 rounded-[3px] border border-field-line bg-card px-4 text-[13px] text-ink transition-colors hover:border-ink-faint',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="size-[18px] text-ink-dim" strokeWidth={1.8} />}
      {children}
    </button>
  );
}

/** The row that sits directly on the canvas above a content card. */
export function SubHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-[49px] items-center justify-between gap-5">
      <span className="truncate text-[15px] text-ink">{title}</span>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}

export function TextField({
  className,
  withIcon = false,
  ...rest
}: ComponentProps<'input'> & { withIcon?: boolean }) {
  const input = (
    <input
      type="text"
      className={cn(
        'h-[36px] w-full rounded-[3px] border border-field-line bg-field text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent',
        withIcon ? 'pl-9 pr-3' : 'px-3',
        className,
      )}
      {...rest}
    />
  );

  if (!withIcon) return input;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-faint" />
      {input}
    </div>
  );
}
