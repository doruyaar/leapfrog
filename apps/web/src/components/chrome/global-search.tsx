'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightLeft,
  Rss,
  Search,
  ShieldHalf,
  Sparkles,
  Swords,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORY_COLOR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useChat } from '@/components/ask/chat-provider';
import type { SearchResponse, SearchResult, SearchResultType } from '@/lib/search-types';

/** One icon per entity kind, matching the sidebar so a hit's type reads at a glance. */
const TYPE_ICON: Record<SearchResultType, LucideIcon> = {
  insight: Rss,
  competitor: Swords,
  battlecard: ShieldHalf,
  change: ArrowRightLeft,
  matrix: Table2,
};

/** A row the user can move to and open — a real result, or the "Ask" fallback. */
type NavItem =
  | { kind: 'result'; result: SearchResult }
  | { kind: 'ask'; query: string; label: string };

const DEBOUNCE_MS = 180;

export function GlobalSearch() {
  const router = useRouter();
  const { openChat, ask } = useChat();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  // Debounced fetch. A per-request AbortController drops stale responses so the
  // results never flicker back to an earlier query the user has already moved past.
  useEffect(() => {
    if (!trimmed) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as SearchResponse;
        setData(json);
        setActive(0);
      } catch {
        // Aborted or failed — leave the last good results in place.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  // A flat, ordered list of everything selectable — results first, then the Ask fallback.
  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];
    for (const group of data?.groups ?? []) {
      for (const result of group.results) items.push({ kind: 'result', result });
    }
    if (trimmed) {
      items.push({
        kind: 'ask',
        query: trimmed,
        label: `Ask about “${trimmed}”`,
      });
    }
    return items;
  }, [data, trimmed]);

  const close = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  // The "Ask" fallback opens the assistant panel and asks straight away, unscoped.
  const startAsk = useCallback(
    (question: string) => {
      close();
      setQuery('');
      openChat();
      void ask(question);
    },
    [close, openChat, ask],
  );

  // Cmd/Ctrl+K from anywhere, or "/" when not already typing in a field, focuses search.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Click outside the search closes the panel.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Keep the highlighted row scrolled into view as the user arrows through results.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (query) setQuery('');
      else close();
      return;
    }
    if (!navItems.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % navItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i - 1 + navItems.length) % navItems.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = navItems[Math.min(active, navItems.length - 1)];
      if (!item) return;
      if (item.kind === 'ask') startAsk(item.query);
      else go(item.result.href);
    }
  }

  const showPanel = open && trimmed.length > 0;
  const hasResults = (data?.total ?? 0) > 0;
  // Running index across groups so keyboard nav and rendering agree on row numbers.
  let cursor = -1;

  return (
    <div ref={containerRef} className="relative ml-3 min-w-0 max-w-[560px] flex-1">
      <div className="flex h-[34px] items-center rounded-[3px] bg-white pl-3.5 pr-1.5">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          aria-label="Search insights, competitors, battlecards, and changes"
          autoComplete="off"
          value={query}
          placeholder="Search insights, competitors, battlecards…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1f2328] outline-none placeholder:text-[#9ea3a9]"
        />
        <kbd className="mr-1 hidden shrink-0 select-none rounded border border-[#e1e4e8] px-1.5 py-0.5 text-[10px] font-medium text-[#9ea3a9] sm:inline-block">
          ⌘K
        </kbd>
        <Search className="size-[18px] shrink-0 text-accent" strokeWidth={2.1} />
      </div>

      {showPanel && (
        <div
          id="global-search-results"
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-md border border-line bg-card py-1.5 shadow-lg"
        >
          {loading && !data ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-faint">Searching…</p>
          ) : hasResults ? (
            <>
              {data!.groups.map((group) => (
                <div key={group.type} className="mb-1 last:mb-0">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    {group.label}
                  </p>
                  {group.results.map((result) => {
                    cursor += 1;
                    const index = cursor;
                    const Icon = TYPE_ICON[result.type];
                    return (
                      <button
                        key={result.key}
                        type="button"
                        role="option"
                        aria-selected={active === index}
                        data-index={index}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(result.href)}
                        className={cn(
                          'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
                          active === index ? 'bg-row-selected' : 'hover:bg-row-hover',
                        )}
                      >
                        <Icon
                          className="mt-0.5 size-4 shrink-0 text-ink-dim"
                          strokeWidth={1.9}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            {result.category && (
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: CATEGORY_COLOR[result.category] }}
                                aria-hidden
                              />
                            )}
                            <span className="truncate text-[13px] font-medium text-ink-strong">
                              {result.title}
                            </span>
                          </span>
                          {result.snippet && (
                            <span className="mt-0.5 block truncate text-[12px] text-ink-dim">
                              {result.snippet}
                            </span>
                          )}
                        </span>
                        {result.meta && (
                          <span className="mt-0.5 shrink-0 text-[11px] text-ink-faint">
                            {result.meta}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              {renderAsk()}
            </>
          ) : (
            <>
              <p className="px-4 py-5 text-center text-[13px] text-ink-dim">
                No matches for “{trimmed}”.
              </p>
              {renderAsk()}
            </>
          )}
        </div>
      )}
    </div>
  );

  /** The always-available fallback: send the query to the grounded Ask assistant. */
  function renderAsk() {
    const askItem = navItems.find((i) => i.kind === 'ask');
    if (!askItem || askItem.kind !== 'ask') return null;
    const index = navItems.length - 1;
    return (
      <div className="mt-1 border-t border-line pt-1">
        <button
          type="button"
          role="option"
          aria-selected={active === index}
          data-index={index}
          onMouseEnter={() => setActive(index)}
          onClick={() => startAsk(askItem.query)}
          className={cn(
            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
            active === index ? 'bg-row-selected' : 'hover:bg-row-hover',
          )}
        >
          <Sparkles className="size-4 shrink-0 text-accent" strokeWidth={1.9} aria-hidden />
          <span className="truncate text-[13px] text-ink">{askItem.label}</span>
        </button>
      </div>
    );
  }
}
