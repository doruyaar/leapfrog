'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, ShieldAlert } from 'lucide-react';
import { MarkdownMessage } from '@/components/signals/markdown-message';
import { VendorMark } from '@/components/signals/badges';
import { impactColor } from '@/lib/format';
import { useChat, type Turn } from './chat-provider';

const SUGGESTIONS = [
  "What's the latest on Sonatype Nexus security?",
  'How is GitLab competing in artifact management?',
  'What pricing changes have competitors made recently?',
  "What is JFrog's stock price today?",
];

/** The conversation surface: message list + composer. State lives in {@link useChat}. */
export function AskChat() {
  const { turns, busy, context, ask } = useChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  function submit(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    void ask(q);
  }

  // Follow the conversation as it grows and while an answer streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {turns.length === 0 ? (
          <Welcome onPick={submit} focus={context?.label ?? null} />
        ) : (
          <div className="space-y-6">
            {turns.map((turn, i) => (
              <div key={i} className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-[6px] bg-accent px-3.5 py-2 text-[13.5px] text-white">
                    {turn.question}
                  </div>
                </div>
                <AssistantTurn turn={turn} />
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 border-t border-line px-3.5 py-3"
      >
        <label htmlFor="ask-input" className="sr-only">
          Ask a question about the tracked competitive-intelligence corpus
        </label>
        <input
          id="ask-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a competitor, a CVE, pricing, a launch…"
          className="h-[40px] flex-1 rounded-[4px] border border-field-line bg-field px-3.5 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-[40px] items-center gap-2 rounded-[4px] bg-accent px-4 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
        >
          <Send className="size-4" />
          Ask
        </button>
      </form>
    </div>
  );
}

function Welcome({
  onPick,
  focus,
}: {
  onPick: (q: string) => void;
  focus: string | null;
}) {
  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <Sparkles className="size-8 text-accent" strokeWidth={1.6} />
      <h2 className="mt-3 text-[18px] text-ink-strong">
        {focus ? 'Ask about this' : 'Ask LeapFrog'}
      </h2>
      <p className="mt-2 max-w-md text-[13px] text-ink-dim">
        {focus ? (
          <>
            Grounded answers about <span className="font-medium text-ink">{focus}</span>{' '}
            and how it fits the competitive picture. Every claim cites and quotes its
            source.
          </>
        ) : (
          <>
            Grounded answers over the tracked corpus. Every claim cites its source — and
            if the answer isn&apos;t in the sources, LeapFrog says so instead of guessing.
          </>
        )}
      </p>
      {!focus && (
        <div className="mt-6 grid w-full grid-cols-1 gap-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-[5px] border border-line bg-canvas px-3.5 py-2.5 text-left text-[13px] text-ink transition-colors hover:border-accent hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssistantTurn({ turn }: { turn: Turn }) {
  if (turn.pending) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-ink-faint">
        <span className="size-2 animate-pulse rounded-full bg-accent" />
        Retrieving and grounding…
      </div>
    );
  }
  if (!turn.answer) return null;
  const { answer, citations, mode } = turn.answer;
  const refused = mode === 'refusal';
  const greeting = mode === 'greeting';

  return (
    <div className="rounded-[6px] border border-line bg-canvas px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider">
        {refused ? (
          <span className="flex items-center gap-1.5 text-ink-faint">
            <ShieldAlert className="size-3.5" /> Not in sources
          </span>
        ) : greeting ? (
          <span className="flex items-center gap-1.5 text-accent">
            <Sparkles className="size-3.5" /> LeapFrog assistant
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-accent">
            <Sparkles className="size-3.5" />{' '}
            {mode === 'llm' ? 'Grounded answer' : 'Grounded (extractive)'}
          </span>
        )}
      </div>

      <MarkdownMessage text={answer} className="text-[14px] text-ink" />

      {citations.length > 0 && (
        <div className="mt-3 border-t border-line-soft pt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Sources
          </div>
          <ul className="space-y-1.5">
            {citations.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span
                  className="grid size-[18px] shrink-0 place-items-center rounded-[3px] text-[10px] font-semibold text-white"
                  style={{ backgroundColor: impactColor(c.impactScore) }}
                >
                  {c.impactScore}
                </span>
                <VendorMark vendor={c.vendor} className="size-[18px] text-[9px]" />
                <a
                  href={`/insights/${c.id}`}
                  className="truncate text-[12.5px] text-ink hover:text-accent"
                >
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
