'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Sparkles, ShieldAlert } from 'lucide-react';
import { CitedText } from '@/components/signals/cited-text';
import { VendorMark } from '@/components/signals/badges';
import { impactColor } from '@/lib/format';

interface Citation {
  id: number;
  title: string;
  url: string;
  vendor: string | null;
  category: string;
  impactScore: number;
}

interface Answer {
  answer: string;
  citations: Citation[];
  mode: 'refusal' | 'extractive' | 'llm';
}

interface Turn {
  question: string;
  answer?: Answer;
  pending?: boolean;
}

const SUGGESTIONS = [
  "What's the latest on Sonatype Nexus security?",
  'How is GitLab competing in artifact management?',
  'What pricing changes have competitors made recently?',
  "What is JFrog's stock price today?",
];

export function AskChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const didAutoAsk = useRef(false);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    setTurns((prev) => [...prev, { question: q, pending: true }]);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
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
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        }),
      );
    }
  }

  // Arriving from the global search palette with `?q=…` asks the question straight away.
  useEffect(() => {
    if (didAutoAsk.current) return;
    const q = searchParams.get('q')?.trim();
    if (q) {
      didAutoAsk.current = true;
      void ask(q);
    }
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col border border-line bg-card">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {turns.length === 0 ? (
          <Welcome onPick={ask} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {turns.map((turn, i) => (
              <div key={i} className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-[6px] bg-accent px-3.5 py-2 text-[13.5px] text-white">
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
          void ask(input);
        }}
        className="flex items-center gap-2 border-t border-line px-4 py-3"
      >
        <input
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

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
      <Sparkles className="size-8 text-accent" strokeWidth={1.6} />
      <h2 className="mt-3 text-[20px] text-ink-strong">Ask LeapFrog</h2>
      <p className="mt-2 max-w-md text-[13.5px] text-ink-dim">
        Grounded answers over the tracked corpus. Every claim cites its source insight —
        and if the answer isn&apos;t in the sources, LeapFrog says so instead of guessing.
      </p>
      <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
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
      <p className="mt-4 text-[11.5px] text-ink-faint">
        Tip: the last example is deliberately outside the corpus — watch it refuse.
      </p>
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

  return (
    <div className="rounded-[6px] border border-line bg-canvas px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider">
        {refused ? (
          <span className="flex items-center gap-1.5 text-ink-faint">
            <ShieldAlert className="size-3.5" /> Not in sources
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-accent">
            <Sparkles className="size-3.5" />{' '}
            {mode === 'llm' ? 'Grounded answer' : 'Grounded (extractive)'}
          </span>
        )}
      </div>

      <CitedText text={answer} className="text-[14px] leading-relaxed text-ink" />

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
