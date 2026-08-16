import {
  ArrowRightLeft,
  Bell,
  FileText,
  Rss,
  ShieldHalf,
  Sparkles,
  Swords,
  Table2,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { label: string; href: string; icon: LucideIcon };

/**
 * One flat list, one working page per entry. Every feature the product ships is
 * reachable in a single click, and nothing else is shown (Krug: if it's not built,
 * it's not a link).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today's Brief", href: '/', icon: FileText },
  { label: 'Insights', href: '/insights', icon: Rss },
  { label: 'Changes', href: '/changes', icon: ArrowRightLeft },
  { label: 'Competitors', href: '/competitors', icon: Swords },
  { label: 'Competitive Matrix', href: '/matrix', icon: Table2 },
  { label: 'Battlecards', href: '/battlecards', icon: ShieldHalf },
  { label: 'Ask', href: '/ask', icon: Sparkles },
  { label: 'Notifications', href: '/notifications', icon: Bell },
];

/** The nav entry that owns a pathname: exact match for `/`, prefix match elsewhere. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
