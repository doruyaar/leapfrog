import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Render text that may contain `[#<id>]` citations, turning each into a link to the
 * signal it references. This is what makes the brief's executive summary auditable:
 * every claim is one click from the source item behind it.
 */
export function CitedText({ text, className }: { text: string; className?: string }) {
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
    const id = match[1]!;
    nodes.push(
      <Link
        key={`cite-${match.index}`}
        href={`/signals/${id}`}
        className="mx-0.5 inline-flex items-center rounded-[3px] bg-accent-soft px-1.5 align-baseline text-[11px] font-medium text-accent hover:underline"
      >
        #{id}
      </Link>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key="tail">{text.slice(lastIndex)}</Fragment>);
  }

  return <p className={cn('text-ink', className)}>{nodes}</p>;
}
