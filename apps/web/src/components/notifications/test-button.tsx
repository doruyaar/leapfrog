'use client';

import { useState, useTransition } from 'react';
import { Check, Send, X } from 'lucide-react';
import { sendTestAction } from '@/lib/actions';

type Feedback = { kind: 'ok' | 'err'; text: string } | null;

/**
 * "Send test now" — fires the current matches to the subscriber immediately so the demo
 * is one click from a real email. Feedback tells the user exactly where it went (a real
 * inbox, or the local `.eml` outbox in demo mode) so there is no silent action.
 */
export function TestButton({ subscriptionId }: { subscriptionId: number }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function onClick() {
    setFeedback(null);
    startTransition(async () => {
      const result = await sendTestAction(subscriptionId);
      if (result.delivered) {
        const where =
          result.channel === 'outbox' ? 'wrote .eml to data/outbox' : 'sent to inbox';
        const sample = 'sample' in result && result.sample ? ' (sample)' : '';
        setFeedback({ kind: 'ok', text: `${where}${sample}` });
      } else {
        setFeedback({ kind: 'err', text: result.reason ?? 'send failed' });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex h-[30px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <Send className="size-3.5" />
        {pending ? 'Sending…' : 'Send test now'}
      </button>
      {feedback && (
        <span
          className={`inline-flex items-center gap-1 text-[11px] ${
            feedback.kind === 'ok' ? 'text-[#0f7d3d]' : 'text-[#c9302c]'
          }`}
        >
          {feedback.kind === 'ok' ? (
            <Check className="size-3.5" />
          ) : (
            <X className="size-3.5" />
          )}
          {feedback.text}
        </span>
      )}
    </span>
  );
}
