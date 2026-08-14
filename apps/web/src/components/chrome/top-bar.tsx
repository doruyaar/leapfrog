import Link from 'next/link';
import { Search } from 'lucide-react';
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

      {/* Search-shaped entry point to Ask — the one place questions get answered. */}
      <Link
        href="/ask"
        className="ml-3 flex h-[34px] min-w-0 max-w-[560px] flex-1 items-center rounded-[3px] bg-white pl-3.5 pr-1.5 transition-opacity hover:opacity-90"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#9ea3a9]">
          Ask about the competitive landscape…
        </span>
        <Search className="size-[18px] shrink-0 text-accent" strokeWidth={2.1} />
      </Link>

      <div className="ml-auto flex shrink-0 items-center gap-3.5 pr-4">
        <ThemeToggle />
      </div>
    </header>
  );
}
