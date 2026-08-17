'use client';

import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AskChat } from './ask-chat';
import { useChat } from './chat-provider';

/**
 * The assistant lives here: a right-side panel that slides in over the content, openable
 * from the top bar or any "Talk about it" button. Non-modal on purpose — the user keeps
 * browsing while the conversation stays in scope.
 */
export function ChatDrawer() {
  const { open, context, closeChat, clearContext } = useChat();

  // Escape closes the panel, matching the global-search dismissal convention.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeChat();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeChat]);

  return (
    <aside
      aria-label="Ask LeapFrog"
      aria-hidden={!open}
      className={cn(
        'fixed right-0 top-[56px] bottom-0 z-40 flex w-full flex-col border-l border-line bg-card shadow-[-4px_0_24px_rgba(0,0,0,0.10)] transition-transform duration-200 ease-out sm:w-[420px]',
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
      )}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Sparkles className="size-[18px] shrink-0 text-accent" strokeWidth={1.8} />
        <span className="text-[14px] font-medium text-ink-strong">Ask LeapFrog</span>
        <button
          type="button"
          onClick={closeChat}
          aria-label="Close chat"
          className="ml-auto grid size-[30px] place-items-center rounded-full text-ink-dim transition-colors hover:bg-row-hover hover:text-ink"
        >
          <X className="size-[18px]" strokeWidth={1.9} />
        </button>
      </header>

      {context && (
        <div className="flex items-center gap-2 border-b border-line-soft bg-accent-soft px-4 py-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-accent">
            Talking about
          </span>
          <span className="truncate text-[12.5px] text-ink" title={context.label}>
            {context.label}
          </span>
          <button
            type="button"
            onClick={clearContext}
            className="ml-auto shrink-0 rounded-[3px] px-1.5 py-0.5 text-[11px] text-ink-dim transition-colors hover:bg-card hover:text-ink"
          >
            Clear
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <AskChat />
      </div>
    </aside>
  );
}
