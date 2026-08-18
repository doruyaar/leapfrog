import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Render text that may contain `[#<id>]` citations, turning each into a link to the
 * signal it references. This is what makes the brief's executive summary auditable:
 * every claim is one click from the source item behind it.
 *
 * When `quotesById` is supplied, hovering (or keyboard-focusing) a citation reveals the
 * verbatim quote(s) the conclusion rests on — the grounding travels with the sentence it
 * supports instead of piling up in a separate wall of references below. Clicking still
 * opens the full source, so the quote is available on touch too.
 */
export function CitedText({
  text,
  className,
  quotesById,
}: {
  text: string;
  className?: string;
  quotesById?: Map<number, string[]>;
}) {
  const nodes: ReactNode[] = [];
  const regex = /\[#(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={lastIndex}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }
    const id = Number(match[1]);
    const quotes = quotesById?.get(id) ?? [];
    const pill = (
      <Link
        href={`/insights/${id}`}
        className="inline-flex items-center rounded-[3px] bg-accent-soft px-1.5 align-baseline text-[11px] font-medium text-accent hover:underline"
      >
        #{id}
      </Link>
    );

    nodes.push(
      quotes.length === 0 ? (
        <span key={`cite-${match.index}`} className="mx-0.5">
          {pill}
        </span>
      ) : (
        <span key={`cite-${match.index}`} className="group relative mx-0.5 inline-block">
          {pill}
          <span
            role="tooltip"
            className={cn(
              'pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-72 max-w-[80vw]',
              '-translate-x-1/2 rounded-md border border-line bg-card p-3 text-left opacity-0 shadow-lg',
              'transition-opacity duration-150',
              'group-hover:visible group-hover:opacity-100',
              'group-focus-within:visible group-focus-within:opacity-100',
            )}
          >
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
              Grounded in #{id}
            </span>
            {quotes.map((quote, i) => (
              <span
                key={i}
                className="mt-1.5 flex gap-1.5 text-[12.5px] italic leading-snug text-ink-dim first:mt-0"
              >
                <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" />
                <span>{quote}</span>
              </span>
            ))}
          </span>
        </span>
      ),
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key="tail">{text.slice(lastIndex)}</Fragment>);
  }

  return <p className={cn('text-ink', className)}>{nodes}</p>;
}
