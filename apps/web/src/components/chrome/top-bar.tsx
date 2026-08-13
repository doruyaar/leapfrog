'use client';

import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  HelpCircle,
  Package,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { moduleForPath } from '@/lib/nav';
import { ThemeToggle } from '@/components/chrome/theme-toggle';

export function TopBar() {
  const pathname = usePathname();
  const isAdmin = moduleForPath(pathname) === 'administration';

  return (
    <header className="flex h-[56px] shrink-0 items-center bg-chrome">
      {/* Logo block — same width as the sidebar */}
      <div className="flex h-full w-[208px] shrink-0 items-center pl-4">
        <span className="text-[18px] font-bold tracking-tight text-accent">LeapFrog</span>
        <span className="ml-1.5 text-[18px] font-normal text-white">Platform</span>
      </div>

      {/* Scope selector — absent on Administration, matching the reference */}
      {!isAdmin && (
        <button
          type="button"
          className="ml-3 flex h-[34px] w-[146px] items-center gap-2 rounded-[3px] border border-chrome-line px-2.5 text-[13px] text-chrome-ink transition-colors hover:border-chrome-ink-faint"
        >
          <Package className="size-[18px] shrink-0 text-chrome-ink-dim" />
          <span className="truncate">Signals</span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-chrome-ink-dim" />
        </button>
      )}

      {/* Search */}
      <div className="ml-3 flex h-[34px] min-w-0 flex-1 items-center rounded-[3px] bg-white pl-3.5 pr-1.5">
        <input
          type="search"
          placeholder={
            isAdmin
              ? 'Search admin resources'
              : 'Search signals with wildcards. E.g.: To find acme, search ac*, *me, acm?'
          }
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#3f4348] outline-none placeholder:text-[#9ea3a9]"
        />
        <Search className="size-[18px] shrink-0 text-accent" strokeWidth={2.1} />
        {!isAdmin && (
          <>
            <span className="mx-2 h-5 w-px bg-[#d9dcdf]" />
            <SlidersHorizontal
              className="size-[18px] shrink-0 text-[#757a80]"
              strokeWidth={1.9}
            />
          </>
        )}
      </div>

      {/* Right cluster */}
      <div className="ml-4 flex shrink-0 items-center gap-3.5 pr-4">
        <button
          type="button"
          className="flex h-[34px] items-center gap-2 rounded-[3px] bg-accent-btn px-4 text-[13px] font-semibold tracking-wide text-white transition-colors hover:bg-accent-hover"
        >
          <span className="grid size-[15px] place-items-center rounded-full bg-white/90">
            <span className="size-[7px] rounded-full bg-accent-btn" />
          </span>
          UPGRADE
        </button>

        <ThemeToggle />

        <HelpCircle className="size-[23px] text-chrome-ink-dim" strokeWidth={1.7} />

        <button
          type="button"
          className="flex items-center gap-2 text-left leading-[1.35]"
        >
          <span>
            <span className="block text-[11px] text-chrome-ink-dim">Welcome,</span>
            <span className="block text-[13px] text-chrome-ink">
              analyst@leapfrog.dev
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-chrome-ink-dim" />
        </button>
      </div>
    </header>
  );
}
