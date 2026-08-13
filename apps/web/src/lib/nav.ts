import {
  Activity,
  Bell,
  Boxes,
  FileText,
  Gauge,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  Radar,
  Rss,
  Settings2,
  ShieldHalf,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Table2,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

export type NavChild = { label: string; href: string; icon?: LucideIcon };

export type NavNode = {
  label: string;
  icon: LucideIcon;
  /** Leaf items navigate directly; group items expand to reveal children. */
  href?: string;
  children?: NavChild[];
};

export type NavSection = { label?: string; items: NavNode[] };

export type ModuleId = 'application' | 'administration';

export type NavModule = {
  id: ModuleId;
  /** Text shown in the green module banner under the module tabs. */
  banner: string;
  sections: NavSection[];
};

export const MODULES: NavModule[] = [
  {
    id: 'application',
    banner: 'Application',
    sections: [
      {
        items: [
          {
            label: 'Dashboard',
            icon: LayoutDashboard,
            children: [
              { label: 'Overview', href: '/dashboard', icon: Gauge },
              { label: 'Trends', href: '/dashboard/trends', icon: Activity },
            ],
          },
          {
            label: 'Intelligence',
            icon: Radar,
            children: [
              { label: 'Quick Setup', href: '/', icon: Wand2 },
              { label: 'Signals', href: '/signals', icon: Rss },
              { label: 'Briefs', href: '/briefs', icon: FileText },
              { label: 'Competitors', href: '/competitors', icon: Swords },
              { label: 'Comparison', href: '/comparison', icon: Table2 },
            ],
          },
          {
            label: 'Battlecards',
            icon: ShieldHalf,
            children: [
              { label: 'All Cards', href: '/battlecards', icon: ShieldHalf },
              {
                label: 'Templates',
                href: '/battlecards/templates',
                icon: LayoutTemplate,
              },
            ],
          },
          { label: 'Ask', icon: Sparkles, href: '/ask' },
          {
            label: 'Alerts',
            icon: Bell,
            children: [
              { label: 'Inbox', href: '/alerts', icon: Inbox },
              {
                label: 'Rules',
                href: '/alerts/rules',
                icon: SlidersHorizontal,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'administration',
    banner: 'Administration',
    sections: [
      {
        items: [
          {
            label: 'Sources',
            icon: Boxes,
            children: [
              { label: 'Sources', href: '/admin/sources' },
              { label: 'Layouts', href: '/admin/layouts' },
            ],
          },
          {
            label: 'Identity and Access',
            icon: Users,
            children: [
              { label: 'Users', href: '/admin/users' },
              { label: 'Permissions', href: '/admin/permissions' },
            ],
          },
          {
            label: 'Security',
            icon: Lock,
            children: [{ label: 'Settings', href: '/admin/security' }],
          },
          {
            label: 'General',
            icon: Settings2,
            children: [{ label: 'Settings', href: '/admin/general' }],
          },
          {
            label: 'Monitoring',
            icon: Activity,
            children: [{ label: 'Logs', href: '/admin/monitoring' }],
          },
        ],
      },
      {
        label: 'Services',
        items: [
          { label: 'Intelligence', icon: Radar, href: '/admin/intelligence' },
          {
            label: 'Enrichment',
            icon: Layers,
            children: [
              { label: 'Prompts', href: '/admin/enrichment' },
              { label: 'Embeddings', href: '/admin/embeddings' },
            ],
          },
        ],
      },
    ],
  },
];

/** The Administration module owns every `/admin/*` route. */
export function moduleForPath(pathname: string): ModuleId {
  return pathname.startsWith('/admin') ? 'administration' : 'application';
}
