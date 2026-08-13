import { Construction } from 'lucide-react';
import { SubHeader } from '@/components/ui/controls';

/**
 * Every nav destination that isn't one of the three built screens renders here,
 * so the shell can be explored end-to-end without dead links.
 */
export default async function PlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const title = (slug.at(-1) ?? '').replace(/-/g, ' ');

  return (
    <div className="px-[34px] pb-11">
      <SubHeader title={<span className="capitalize">{title}</span>} />
      <div className="flex min-h-[450px] items-center justify-center border border-line bg-card">
        <div className="flex flex-col items-center gap-3 text-center">
          <Construction className="size-7 text-accent" strokeWidth={1.7} />
          <p className="text-[17px] capitalize text-ink-strong">{title}</p>
          <p className="max-w-md text-[13px] text-ink-dim">
            Part of the navigation model, not yet built. The three reference screens are
            Quick Setup, Signals, and Administration → Sources.
          </p>
          <code className="mt-1 rounded-[3px] bg-canvas px-3 py-1.5 text-[12px] text-ink-faint">
            /{slug.join('/')}
          </code>
        </div>
      </div>
    </div>
  );
}
