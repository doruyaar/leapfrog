import Link from 'next/link';
import type { Category } from '@/lib/queries';
import { CATEGORY_COLOR } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CategoryFilterProps {
  basePath: string;
  active: Category | null;
  breakdown: Array<{ category: Category; count: number }>;
  total: number;
}

/**
 * Category filter as plain links (no client JS): each chip is a URL with `?category=…`,
 * so the filtered feed is server-rendered, shareable, and works without hydration. "All"
 * clears the filter.
 */
export function CategoryFilter({
  basePath,
  active,
  breakdown,
  total,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip href={basePath} isActive={active === null} label="All" count={total} />
      {breakdown.map(({ category, count }) => (
        <Chip
          key={category}
          href={`${basePath}?category=${category}`}
          isActive={active === category}
          label={category}
          count={count}
          color={CATEGORY_COLOR[category]}
        />
      ))}
    </div>
  );
}

function Chip({
  href,
  isActive,
  label,
  count,
  color,
}: {
  href: string;
  isActive: boolean;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors',
        isActive
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line text-ink-dim hover:border-accent hover:text-accent',
      )}
    >
      {color && (
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
      <span className="text-[11px] tabular-nums text-ink-faint">{count}</span>
    </Link>
  );
}
