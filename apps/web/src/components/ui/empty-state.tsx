import { Database } from 'lucide-react';

/**
 * Shown when there is no seeded database yet. Rather than a blank screen or a crash, the
 * demo tells the reviewer exactly how to populate it — keeping the "it just runs" promise.
 */
export function EmptyState({
  title = 'No data yet',
  hint = 'Load the committed demo snapshot to populate the product — no API key needed.',
  command = 'npm run seed',
}: {
  title?: string;
  hint?: string;
  command?: string;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center border border-line bg-card">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <Database className="size-7 text-accent" strokeWidth={1.6} />
        <p className="text-[17px] text-ink-strong">{title}</p>
        <p className="text-[13px] text-ink-dim">{hint}</p>
        <code className="mt-1 rounded-[3px] bg-canvas px-3 py-1.5 text-[12px] text-ink-faint">
          {command}
        </code>
      </div>
    </div>
  );
}
