'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Clock, Info, X } from 'lucide-react';
import type { CellExplainabilityView } from '@/lib/queries';
import { CitedText } from '@/components/signals/cited-text';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ConfidenceBadge,
  describeConfidence,
  EvidenceList,
  LevelChip,
} from './matrix-visuals';

/**
 * One matrix cell. At a glance it is just a coverage rating (coloured dot + word), so
 * the grid reads like a billboard. Clicking it opens a compact popover that answers
 * "why does the system believe this?" — the note, a confidence indication, when it was
 * last updated, and the supporting evidence (each a link to its signal). Click, not
 * hover, so it works on touch and by keyboard.
 */
export function MatrixCell({
  detail,
  isFocus,
}: {
  detail: CellExplainabilityView;
  isFocus: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left transition-colors',
          'hover:bg-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          open && 'bg-accent-soft ring-2 ring-accent',
        )}
        title={`Why ${detail.vendor} has this rating`}
      >
        <LevelChip level={detail.level} />
        <span className="flex items-center gap-1">
          {detail.lastUpdatedAt && (
            <span
              className="size-1.5 rounded-full bg-accent"
              aria-label="Recently updated by an approved edit"
            />
          )}
          <Info
            className={cn(
              'size-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-accent',
              open && 'text-accent',
            )}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <CellPopover
          detail={detail}
          isFocus={isFocus}
          anchor={buttonRef}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

const POPOVER_WIDTH = 340;
const GAP = 8;

function CellPopover({
  detail,
  isFocus,
  anchor,
  onClose,
}: {
  detail: CellExplainabilityView;
  isFocus: boolean;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(GAP, rect.left),
      window.innerWidth - POPOVER_WIDTH - GAP,
    );
    setPos({ top: rect.bottom + GAP, left });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    // A scroll would detach the popover from its cell — close instead of chasing it.
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose, place]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [pos]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`Why ${detail.vendor} has this ${detail.axisLabel} rating`}
        tabIndex={-1}
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: POPOVER_WIDTH,
        }}
        className="fixed z-50 max-h-[70vh] overflow-y-auto rounded-[6px] border border-line bg-card shadow-xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {detail.axisLabel}
            </div>
            <div className="text-[15px] font-semibold text-ink-strong">
              {detail.vendor}
              {isFocus && <span className="ml-1 text-[10px] text-accent">(focus)</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-ink-faint hover:bg-canvas hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3.5 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <LevelChip level={detail.level} className="text-[13px] font-medium" />
            <ConfidenceBadge
              level={detail.confidence}
              factors={detail.confidenceFactors}
            />
          </div>

          <CitedText text={detail.note} className="text-[13px] leading-relaxed" />

          <p className="text-[11.5px] text-ink-faint">
            {describeConfidence(detail.confidenceFactors)}
          </p>

          <div className="flex items-center gap-1.5 border-t border-line-soft pt-3 text-[11.5px] text-ink-dim">
            <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
            {detail.lastUpdatedAt ? (
              <span>
                Last updated {formatDate(detail.lastUpdatedAt)}
                {detail.lastUpdatedSignalId != null && (
                  <>
                    {' '}
                    <Link
                      href={`/insights/${detail.lastUpdatedSignalId}`}
                      className="text-accent hover:underline"
                    >
                      from insight #{detail.lastUpdatedSignalId}
                    </Link>
                  </>
                )}
              </span>
            ) : (
              <span>No approved edits yet — this is the original curated rating.</span>
            )}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              Why this rating
              {detail.evidenceCount > detail.evidence.length && (
                <span className="ml-1 font-normal normal-case text-ink-faint">
                  (top {detail.evidence.length} of {detail.evidenceCount})
                </span>
              )}
            </div>
            <EvidenceList evidence={detail.evidence} />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
