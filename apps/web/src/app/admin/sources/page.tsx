import type { Metadata } from 'next';
import { ChevronUp, Link2, Plus, RefreshCw } from 'lucide-react';
import { OutlineButton, SubHeader, TextField } from '@/components/ui/controls';

export const metadata: Metadata = { title: 'Sources' };

const TABS = ['Local', 'Remote', 'Virtual', 'Distribution'];

const ROWS = [
  {
    key: 'all-vendors-virtual',
    type: 'RSS',
    mark: '#f26522',
    selected: '2 | sonatype-blog-local, sonatype-blog-rem…',
    active: false,
  },
  {
    key: 'security-feeds-virtual',
    type: 'NVD',
    mark: '#c9302c',
    selected: '2 | nvd-cve-local, nvd-cve-remote…',
    active: false,
  },
  {
    key: 'product-news-virtual',
    type: 'Atom',
    mark: '#8e8e93',
    selected: '2 | gitlab-blog-local, github-blog-remote',
    active: true,
  },
];

export default function AdminSourcesPage() {
  return (
    <div className="px-[34px] pb-11">
      <SubHeader
        title="Sources"
        actions={
          <>
            <OutlineButton icon={Link2}>Set Me Up</OutlineButton>
            <OutlineButton icon={Plus}>Add Sources</OutlineButton>
          </>
        }
      />

      <div className="border border-line bg-card px-9 pb-14 pt-7">
        <div className="flex items-center gap-10 border-b border-line">
          {TABS.map((tab) => {
            const active = tab === 'Virtual';
            return (
              <button
                key={tab}
                type="button"
                className={`-mb-px border-b-2 pb-3 text-[14px] transition-colors ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink hover:text-ink-strong'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <p className="mt-7 text-[13px] text-ink">3 Sources</p>

        <div className="mt-3 max-w-[343px]">
          <TextField placeholder="Filter" />
        </div>

        <table className="mt-9 w-full table-fixed border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="w-[30%] pb-3 pl-4 text-[13px] font-normal text-ink-dim">
                <span className="inline-flex items-center gap-1.5">
                  Source Key
                  <ChevronUp className="size-[15px]" />
                </span>
              </th>
              <th className="w-[14%] pb-3 text-[13px] font-normal text-ink-dim">Type</th>
              <th className="w-[32%] pb-3 text-[13px] font-normal text-ink-dim">
                Selected Sources
              </th>
              <th className="w-[24%] pb-3 text-[13px] font-normal text-ink-dim">
                Recalculate Index
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.key}
                className="border-b border-line-soft transition-colors hover:bg-row-hover"
              >
                <td className="py-4 pl-4 text-[13px] text-ink">{row.key}</td>
                <td className="py-4 text-[13px] text-ink">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="grid size-[21px] place-items-center rounded-[3px] text-[10px] font-bold text-white"
                      style={{ backgroundColor: row.mark }}
                    >
                      {row.type.slice(0, 2).toUpperCase()}
                    </span>
                    {row.type}
                  </span>
                </td>
                <td className="truncate py-4 pr-6 text-[13px] text-ink">
                  {row.selected}
                </td>
                <td className="py-4">
                  <RefreshCw
                    className={`size-[22px] ${row.active ? 'text-ink' : 'text-ink-faint opacity-50'}`}
                    strokeWidth={1.7}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
