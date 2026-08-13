import { Plus, Wand2 } from 'lucide-react';
import { SOURCE_TYPES } from '@/lib/source-types';

export default function QuickSetupPage() {
  return (
    <div className="px-[34px] pb-11 pt-5">
      <div className="border border-line bg-card px-11 py-[52px]">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3.5">
            <Wand2 className="size-[34px] text-accent" strokeWidth={1.6} />
            <h1 className="text-[38px] font-normal leading-none text-ink-strong">
              Quick Setup
            </h1>
          </div>
          <p className="mt-4 text-[15px] text-ink-dim">
            Select your source type to get started
          </p>
        </div>

        <div className="mx-auto mt-11 grid max-w-[928px] grid-cols-4 gap-x-10 gap-y-10 sm:grid-cols-5 lg:grid-cols-7">
          {SOURCE_TYPES.map((source) => (
            <button
              key={source.name}
              type="button"
              className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-[3px] border border-line bg-card px-1.5 transition-shadow hover:shadow-[0_2px_9px_rgba(0,0,0,0.14)]"
            >
              {!source.enabled && (
                <span className="absolute -right-2 -top-2 grid size-[21px] place-items-center rounded-full bg-accent text-white">
                  <Plus className="size-[14px]" strokeWidth={3} />
                </span>
              )}
              <span
                className="grid size-[42px] place-items-center rounded-[4px] text-[14px] font-bold text-white"
                style={{ backgroundColor: source.color }}
              >
                {source.short}
              </span>
              <span className="max-w-full truncate text-[12px] text-ink-dim">
                {source.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
