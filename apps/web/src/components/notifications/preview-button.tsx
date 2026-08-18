'use client';

import { useEffect, useState, useTransition } from 'react';
import { Eye, X } from 'lucide-react';
import type { NotificationPreview } from '@leapfrog/core';
import { previewNotificationAction } from '@/lib/actions';

type PreviewState =
  { kind: 'preview'; data: NotificationPreview } | { kind: 'error'; text: string };

/**
 * "Preview email" — renders how this subscription's alert will look for its current
 * configuration, in a dialog, without sending or storing anything. Real delivery is wired
 * up in production; until then this is the whole notification demo, so the button says
 * exactly what it does and the preview is the real, formatted email.
 */
export function PreviewButton({ subscriptionId }: { subscriptionId: number }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<PreviewState | null>(null);

  function open() {
    startTransition(async () => {
      const result = await previewNotificationAction(subscriptionId);
      setState(
        'error' in result
          ? { kind: 'error', text: result.error }
          : { kind: 'preview', data: result },
      );
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className="inline-flex h-[30px] items-center gap-1 rounded-[4px] border border-line px-2.5 text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <Eye className="size-3.5" />
        {pending ? 'Rendering…' : 'Preview email'}
      </button>
      {state && <PreviewDialog state={state} onClose={() => setState(null)} />}
    </>
  );
}

function PreviewDialog({ state, onClose }: { state: PreviewState; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Nothing to render as an email: an error, or an empty corpus with no sample to show.
  const message =
    state.kind === 'error'
      ? state.text
      : state.data.html === ''
        ? state.data.reason
        : null;
  const html = state.kind === 'preview' ? state.data.html : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Email preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-[12px] text-ink-faint">Preview · not sent</p>
            {state.kind === 'preview' && message === null && (
              <>
                <p className="truncate text-[14px] font-semibold text-ink-strong">
                  {state.data.subject}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-dim">
                  To {state.data.email} · {state.data.matched} insight
                  {state.data.matched === 1 ? '' : 's'}
                  {state.data.sample && (
                    <span className="ml-1.5 rounded-full border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">
                      sample — nothing matches yet
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-[4px] p-1 text-ink-faint transition-colors hover:bg-field hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {message !== null ? (
          <div className="px-4 py-10 text-center text-[13px] text-ink-dim">{message}</div>
        ) : (
          <iframe
            title="Email preview"
            sandbox=""
            className="h-[70vh] w-full bg-white"
            srcDoc={html}
          />
        )}
      </div>
    </div>
  );
}
