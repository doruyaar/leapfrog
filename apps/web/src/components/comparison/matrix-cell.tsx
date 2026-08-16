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
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const viewportHeight = window.innerHeight;

    const left = Math.min(
      Math.max(GAP, rect.left),
      window.innerWidth - POPOVER_WIDTH - GAP,
    );

    // Point the card away from the nearer edge: drop it below the cell when the
    // cell sits in the top half of the viewport, raise it above when the cell is
    // in the bottom half. This keeps the card in view wherever the page is scrolled.
    const openUpward = rect.top + rect.height / 2 > viewportHeight / 2;
    const rawTop = openUpward ? rect.top - GAP - panelHeight : rect.bottom + GAP;

    // Keep the card fully on screen even if the chosen side is a little tight.
    const top = Math.min(
      Math.max(GAP, rawTop),
      Math.max(GAP, viewportHeight - panelHeight - GAP),
    );

    setPos({ top, left });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  // Focus the card once, on open — not on every reposition, which would steal
  // focus back mid-scroll.
  useEffect(() => {
    panelRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Follow the cell while the page scrolls instead of locking or closing; only
    // dismiss once the cell has scrolled out of view (there's nothing left to
    // anchor to). Reposition on an animation frame so scrolling stays smooth.
    let frame = 0;
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = anchor.current?.getBoundingClientRect();
        if (!rect) return;
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
          onClose();
          return;
        }
        place();
      });
    };

    // Close on any interaction outside the card, but ignore the anchor button so
    // its own click can toggle the card without immediately reopening it.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchor.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', track);
    window.addEventListener('scroll', track, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', track);
      window.removeEventListener('scroll', track, true);
    };
  }, [onClose, place, anchor]);

  if (typeof document === 'undefined') return null;

  return createPortal(
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
          <ConfidenceBadge level={detail.confidence} factors={detail.confidenceFactors} />
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
    </div>,
    document.body,
  );
}
