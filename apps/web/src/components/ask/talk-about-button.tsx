'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChat, type ChatContext } from './chat-provider';

/**
 * "Talk about it" — opens the assistant scoped to a specific signal. Clicking loads the
 * subject into the chat so the user's questions are answered against that context, while
 * grounding and refusal stay intact. Drop it anywhere a signal is shown.
 */
export function TalkAboutButton({
  context,
  label = 'Talk about it',
  className,
  revealOnHover = false,
}: {
  context: ChatContext;
  label?: string;
  className?: string;
  /** Hide until the nearest `group/talk` ancestor is hovered (or the button is focused). */
  revealOnHover?: boolean;
}) {
  const { openChat } = useChat();

  return (
    <button
      type="button"
      onClick={() => openChat(context)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-card px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:border-accent hover:text-accent',
        revealOnHover &&
          'opacity-0 transition-opacity group-hover/talk:opacity-100 focus-visible:opacity-100',
        className,
      )}
    >
      <Sparkles className="size-3.5" strokeWidth={1.9} />
      {label}
    </button>
  );
}
