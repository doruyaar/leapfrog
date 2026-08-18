'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface Citation {
  id: number;
  title: string;
  url: string;
  vendor: string | null;
  category: string;
  impactScore: number;
}

export interface Answer {
  answer: string;
  citations: Citation[];
  mode: 'refusal' | 'extractive' | 'llm' | 'greeting';
}

export interface Turn {
  question: string;
  answer?: Answer;
  pending?: boolean;
}

/**
 * The subject the user clicked "Talk about it" on. `label` biases retrieval toward the
 * discussed signal; `preamble` tells the grounded model what "it" refers to. It never
 * adds facts — answers still cite retrieved passages.
 */
export interface ChatContext {
  label: string;
  preamble: string;
  /** The signal id being discussed; pinned server-side so it is always answerable. */
  focusId?: number;
}

interface ChatState {
  open: boolean;
  turns: Turn[];
  busy: boolean;
  context: ChatContext | null;
  openChat: (context?: ChatContext) => void;
  closeChat: () => void;
  toggle: () => void;
  clearContext: () => void;
  ask: (question: string) => Promise<void>;
}

const ChatStateContext = createContext<ChatState | null>(null);

/**
 * Global chat store, openable from anywhere with optional context. Every open is a
 * fresh session — "Talk about it" and the top-bar toggle both start with no history.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<ChatContext | null>(null);

  // Opening the assistant always starts a clean session: previous turns are
  // discarded and the context is replaced (or cleared when opened without one).
  const openChat = useCallback((next?: ChatContext) => {
    setTurns([]);
    setContext(next ?? null);
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    setOpen((v) => {
      if (!v) {
        setTurns([]);
        setContext(null);
      }
      return !v;
    });
  }, []);
  const clearContext = useCallback(() => setContext(null), []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setBusy(true);
      setTurns((prev) => [...prev, { question: q, pending: true }]);

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question: q,
            context: context
              ? {
                  label: context.label,
                  preamble: context.preamble,
                  focusId: context.focusId,
                }
              : undefined,
          }),
        });
        const answer = (await res.json()) as Answer;
        setTurns((prev) =>
          prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, answer, pending: false } : t,
          ),
        );
      } catch {
        setTurns((prev) =>
          prev.map((t, i) =>
            i === prev.length - 1
              ? {
                  ...t,
                  pending: false,
                  answer: {
                    answer: 'Something went wrong reaching the retrieval service.',
                    citations: [],
                    mode: 'refusal',
                  },
                }
              : t,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, context],
  );

  const value = useMemo<ChatState>(
    () => ({
      open,
      turns,
      busy,
      context,
      openChat,
      closeChat,
      toggle,
      clearContext,
      ask,
    }),
    [open, turns, busy, context, openChat, closeChat, toggle, clearContext, ask],
  );

  return <ChatStateContext.Provider value={value}>{children}</ChatStateContext.Provider>;
}

/** Access the global chat store. Must be used under a {@link ChatProvider}. */
export function useChat(): ChatState {
  const ctx = useContext(ChatStateContext);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
}
