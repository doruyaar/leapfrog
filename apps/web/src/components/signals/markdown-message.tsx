import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Render an assistant answer as Markdown while preserving `[#<id>]` citations as links
 * to the signal they reference. Citations are the product's trust contract, so we turn
 * each `[#123]` into a proper Markdown link before parsing and give it the pill styling
 * in the anchor renderer. Everything else is standard grounded Markdown (headings,
 * lists, emphasis, code) so richer model output reads the way it was written.
 */
export function MarkdownMessage({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // Promote bare `[#123]` citations to real Markdown links so the parser keeps them
  // as anchors; the anchor renderer below recognises them and applies the pill style.
  const withCitations = text.replace(/\[#(\d+)\]/g, '[#$1](/insights/$1)');

  return (
    <div
      className={cn(
        'text-ink [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        'space-y-3 leading-relaxed',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node: _node, ...props }) => <p {...props} />,
          a: ({ node: _node, href, children, ...props }) => {
            const isCitation =
              typeof href === 'string' && /^\/insights\/\d+$/.test(href);
            if (isCitation) {
              return (
                <Link
                  href={href!}
                  className="mx-0.5 inline-flex items-center rounded-[3px] bg-accent-soft px-1.5 align-baseline text-[11px] font-medium text-accent hover:underline"
                >
                  {children}
                </Link>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2 hover:no-underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          ul: ({ node: _node, ...props }) => (
            <ul className="list-disc space-y-1 pl-5" {...props} />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol className="list-decimal space-y-1 pl-5" {...props} />
          ),
          li: ({ node: _node, ...props }) => <li className="pl-0.5" {...props} />,
          h1: ({ node: _node, ...props }) => (
            <h1 className="text-[15px] font-semibold text-ink-strong" {...props} />
          ),
          h2: ({ node: _node, ...props }) => (
            <h2 className="text-[14.5px] font-semibold text-ink-strong" {...props} />
          ),
          h3: ({ node: _node, ...props }) => (
            <h3 className="text-[14px] font-semibold text-ink-strong" {...props} />
          ),
          strong: ({ node: _node, ...props }) => (
            <strong className="font-semibold text-ink-strong" {...props} />
          ),
          em: ({ node: _node, ...props }) => <em className="italic" {...props} />,
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              className="border-l-2 border-line pl-3 text-ink-dim italic"
              {...props}
            />
          ),
          hr: ({ node: _node, ...props }) => (
            <hr className="border-line-soft" {...props} />
          ),
          code: ({ node: _node, className: codeClass, ...props }) => {
            const isBlock = /language-/.test(codeClass ?? '');
            if (isBlock) {
              return (
                <code
                  className={cn(
                    'block overflow-x-auto rounded-[4px] bg-field p-3 font-mono text-[12.5px]',
                    codeClass,
                  )}
                  {...props}
                />
              );
            }
            return (
              <code
                className="rounded-[3px] bg-field px-1 py-0.5 font-mono text-[12.5px]"
                {...props}
              />
            );
          },
          pre: ({ node: _node, ...props }) => (
            <pre className="overflow-x-auto" {...props} />
          ),
        }}
      >
        {withCitations}
      </ReactMarkdown>
    </div>
  );
}
