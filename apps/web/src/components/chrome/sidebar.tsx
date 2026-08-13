'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Cog, LayoutGrid } from 'lucide-react';
import { MODULES, moduleForPath, type ModuleId, type NavNode } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/chrome/brand-mark';

function isNodeActive(node: NavNode, pathname: string): boolean {
  if (node.href && node.href === pathname) return true;
  return (node.children ?? []).some((c) => c.href === pathname);
}

/**
 * Overrides are keyed by the value they override, so navigating to a new route
 * (or module) automatically discards a stale user choice without an effect.
 */
type Override<T> = { key: string; value: T } | null;

export function Sidebar() {
  const pathname = usePathname();
  const routeModule = moduleForPath(pathname);

  const [moduleOverride, setModuleOverride] = useState<Override<ModuleId>>(null);
  const activeModuleId =
    moduleOverride?.key === routeModule ? moduleOverride.value : routeModule;
  const activeModule = MODULES.find((m) => m.id === activeModuleId) ?? MODULES[0]!;

  // The group containing the current route starts expanded, mirroring the
  // reference UI where the active section is always open.
  const routeGroup = useMemo(() => {
    const items = activeModule.sections.flatMap((s) => s.items);
    const match = items.find((i) => i.children && isNodeActive(i, pathname));
    return (match ?? items.find((i) => i.children))?.label ?? null;
  }, [activeModule, pathname]);

  const [groupOverride, setGroupOverride] = useState<Override<string | null>>(null);
  const groupKey = `${activeModuleId}:${routeGroup}`;
  const openGroup = groupOverride?.key === groupKey ? groupOverride.value : routeGroup;

  const toggleGroup = (label: string) =>
    setGroupOverride({
      key: groupKey,
      value: openGroup === label ? null : label,
    });

  return (
    <aside className="flex w-[208px] shrink-0 flex-col bg-chrome">
      {/* Module tabs */}
      <div className="flex h-[28px] items-center gap-px pl-1.5">
        {MODULES.map((m) => {
          const Icon = m.id === 'application' ? LayoutGrid : Cog;
          const active = m.id === activeModuleId;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setModuleOverride({ key: routeModule, value: m.id })}
              title={m.banner}
              aria-label={m.banner}
              aria-pressed={active}
              className={cn(
                'grid h-[28px] w-[31px] place-items-center transition-colors',
                active
                  ? 'bg-accent text-white'
                  : 'text-chrome-ink-dim hover:text-chrome-ink',
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2} />
            </button>
          );
        })}
        <ChevronLeft className="ml-auto mr-2 size-4 text-chrome-ink-faint" />
      </div>

      {/* Green module banner */}
      <div className="flex h-[28px] items-center justify-center bg-accent">
        <span className="text-[12px] font-medium text-white">{activeModule.banner}</span>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {activeModule.sections.map((section, si) => (
          <div key={section.label ?? si}>
            {section.label && (
              <div className="px-4 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-chrome-ink-faint">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isNodeActive(item, pathname);
              const open = openGroup === item.label;
              const rowClass = cn(
                'flex h-[45px] w-full items-center gap-3 px-4 text-[12px] transition-colors',
                active
                  ? 'bg-chrome-active text-accent'
                  : 'text-chrome-ink hover:bg-chrome-hover',
              );
              const iconClass = cn(
                'size-[18px] shrink-0',
                active ? 'text-accent' : 'text-chrome-ink-dim',
              );

              return (
                <div key={item.label}>
                  {item.href ? (
                    <Link href={item.href} className={rowClass}>
                      <Icon className={iconClass} strokeWidth={1.8} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.label)}
                      aria-expanded={open}
                      className={rowClass}
                    >
                      <Icon className={iconClass} strokeWidth={1.8} />
                      <span className="truncate text-left">{item.label}</span>
                      {open ? (
                        <ChevronDown className="ml-auto size-4 shrink-0 opacity-70" />
                      ) : (
                        <ChevronRight className="ml-auto size-4 shrink-0 opacity-70" />
                      )}
                    </button>
                  )}

                  {item.children && open && (
                    <div className="bg-chrome-sub">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'flex h-[45px] items-center gap-3 pl-9 pr-4 text-[12px] transition-colors',
                              childActive
                                ? 'text-accent'
                                : 'text-chrome-ink-dim hover:text-chrome-ink',
                            )}
                          >
                            {ChildIcon && (
                              <ChildIcon
                                className="size-[16px] shrink-0"
                                strokeWidth={1.8}
                              />
                            )}
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Getting Started pill */}
      <div className="px-3.5 pb-3 pt-4">
        <button
          type="button"
          className="flex h-[36px] w-full items-center justify-center gap-2 rounded-[4px] bg-chrome-active text-[12px] text-white transition-colors hover:brightness-110"
        >
          <BrandMark className="size-[15px] text-accent" />
          Getting Started
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3.5 pb-4">
        <BrandMark className="size-[22px] shrink-0 text-accent" />
        <div className="leading-[1.3]">
          <div className="text-[11px] text-chrome-ink-dim">LeapFrog Cloud</div>
          <div className="text-[10px] text-chrome-ink-faint">
            © Copyright 2026 LeapFrog Ltd
          </div>
        </div>
      </div>
    </aside>
  );
}
