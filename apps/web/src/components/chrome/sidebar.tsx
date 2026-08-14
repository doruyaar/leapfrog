'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, isNavActive } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/chrome/brand-mark';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[208px] shrink-0 flex-col bg-chrome">
      <nav className="flex-1 overflow-y-auto pt-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-[45px] items-center gap-3 px-4 text-[12px] transition-colors',
                active
                  ? 'bg-chrome-active text-accent'
                  : 'text-chrome-ink hover:bg-chrome-hover',
              )}
            >
              <Icon
                className={cn(
                  'size-[18px] shrink-0',
                  active ? 'text-accent' : 'text-chrome-ink-dim',
                )}
                strokeWidth={1.8}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 px-3.5 pb-4">
        <BrandMark className="size-[22px] shrink-0 text-accent" />
        <div className="leading-[1.3]">
          <div className="text-[11px] text-chrome-ink-dim">LeapFrog</div>
          <div className="text-[10px] text-chrome-ink-faint">
            Competitive intelligence
          </div>
        </div>
      </div>
    </aside>
  );
}
