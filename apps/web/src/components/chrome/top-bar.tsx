import Link from 'next/link';
import { GlobalSearch } from '@/components/chrome/global-search';
import { ThemeToggle } from '@/components/chrome/theme-toggle';

export function TopBar() {
  return (
    <header className="flex h-[56px] shrink-0 items-center bg-chrome">
      <div className="flex h-full w-[208px] shrink-0 items-center pl-4">
        <Link href="/" className="flex items-baseline">
          <span className="text-[18px] font-bold tracking-tight text-accent">
            LeapFrog
          </span>
        </Link>
      </div>

      {/* Search across every entity; falls back to the Ask assistant for open questions. */}
      <GlobalSearch />

      <div className="ml-auto flex shrink-0 items-center gap-3.5 pr-4">
        <ThemeToggle />
      </div>
    </header>
  );
}
