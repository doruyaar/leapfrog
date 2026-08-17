'use client';

import { MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChat } from './chat-provider';

/** Opens/closes the right-side assistant. Sits beside the theme toggle in the top bar. */
export function ChatToggle() {
  const { open, toggle } = useChat();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      title="Ask LeapFrog"
      aria-label="Ask LeapFrog"
      className={cn(
        'grid size-[31px] place-items-center rounded-full transition-colors',
        open
          ? 'bg-chrome-hover text-accent'
          : 'text-chrome-ink-dim hover:bg-chrome-hover hover:text-chrome-ink',
      )}
    >
      <MessagesSquare className="size-[19px]" strokeWidth={1.9} />
    </button>
  );
}
