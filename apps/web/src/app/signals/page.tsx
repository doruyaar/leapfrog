import type { Metadata } from 'next';
import {
  ChevronRight,
  Copy,
  Filter,
  Folder,
  Link2,
  MoreVertical,
  RefreshCw,
  Rss,
  Star,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { OutlineButton, SubHeader, TextField } from '@/components/ui/controls';

export const metadata: Metadata = { title: 'Signals' };

const TREE = [
  'all-vendors-virtual',
  'security-feeds-virtual',
  'product-news-virtual',
  'pipeline-build-info',
  'sonatype-blog-local',
  'generic-notes-local',
  'gitlab-blog-local',
  'github-blog-local',
  'example-vendor-local',
  'analyst-notes-local',
  'nvd-cve-remote',
  'hn-algolia-remote',
  'gh-releases-remote',
  'nvd-cve-remote-cache',
  'hn-algolia-remote-cache',
  'gh-releases-remote-cache',
];

const INFO_ROWS: { label: string; value: string; copy?: boolean }[] = [
  { label: 'Name:', value: 'all-vendors-virtual', copy: true },
  { label: 'Source Type:', value: 'RSS' },
  { label: 'Source Path:', value: 'all-vendors-virtual/', copy: true },
  {
    label: 'URL to feed:',
    value: 'https://leapfrog.local/intel/all-vendors-virtual/',
    copy: true,
  },
  { label: 'Description:', value: '' },
];

export default function SignalsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col px-[34px] pb-8">
      <SubHeader
        title="Happily tracking 148 signals"
        actions={
          <>
            <OutlineButton icon={Wand2}>Quick Setup</OutlineButton>
            <OutlineButton icon={Link2}>Set Me Up</OutlineButton>
            <OutlineButton icon={Upload}>Ingest</OutlineButton>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 gap-2">
        {/* Left pane — source tree */}
        <div className="flex w-[346px] shrink-0 flex-col border border-line bg-card">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <TextField withIcon placeholder="Filter sources" className="h-[34px]" />
            <Filter className="size-[18px] shrink-0 text-ink-dim" />
            <button
              type="button"
              className="shrink-0 text-[13px] text-ink-dim underline underline-offset-2 hover:text-accent"
            >
              Clear
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-line-soft px-4 pb-3">
            <span className="flex items-center gap-2 text-[13px] text-ink">
              <Star className="size-[18px] text-ink-strong" strokeWidth={1.9} />
              My Favorites
              <span className="rounded-full bg-line px-2 text-[11px] text-ink-dim">
                0
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-dim">
              Tree View:
              <span className="ml-0.5 flex overflow-hidden rounded-[3px] border border-field-line">
                <span className="grid h-[24px] w-[27px] place-items-center bg-card">
                  <Folder className="size-[14px] text-ink-dim" />
                </span>
                <span className="grid h-[24px] w-[27px] place-items-center bg-accent">
                  <Rss className="size-[14px] text-white" />
                </span>
              </span>
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
            {TREE.map((node, i) => (
              <button
                key={node}
                type="button"
                className={`flex h-[27px] w-full items-center gap-1.5 px-3 text-[14px] transition-colors ${
                  i === 0 ? 'bg-row-selected text-accent' : 'text-ink hover:bg-row-hover'
                }`}
              >
                <ChevronRight className="size-[16px] shrink-0 text-ink-faint" />
                <Rss
                  className={`size-[16px] shrink-0 ${i === 0 ? 'text-accent' : 'text-ink-dim'}`}
                />
                <span className="truncate">{node}</span>
              </button>
            ))}
          </div>

          <div className="flex h-[31px] items-center gap-2 border-t border-line bg-canvas px-3 text-[14px] text-ink">
            <ChevronRight className="size-[16px] text-ink-faint" />
            <Trash2 className="size-[16px] text-ink-dim" />
            Trash Can
          </div>
        </div>

        {/* Right pane — detail */}
        <div className="flex min-w-0 flex-1 flex-col border border-line bg-card">
          <div className="flex h-[48px] shrink-0 items-center gap-3 px-6">
            <Rss className="size-[18px] text-accent" />
            <span className="truncate text-[17px] text-ink-strong">
              all-vendors-virtual
            </span>
            <div className="ml-auto flex items-center gap-4 text-ink-dim">
              <RefreshCw className="size-[18px]" />
              <Star className="size-[18px]" />
              <MoreVertical className="size-[18px]" />
            </div>
          </div>

          <div className="shrink-0 border-b border-line px-6">
            <span className="inline-block border-b-2 border-accent pb-2 text-[13px] text-accent">
              General
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-9 pt-6">
            <Section title="Info" />
            <dl className="mt-4 space-y-3.5">
              {INFO_ROWS.map((row) => (
                <div key={row.label} className="flex gap-6 text-[13px]">
                  <dt className="w-[155px] shrink-0 text-ink">{row.label}</dt>
                  <dd className="flex min-w-0 items-center gap-2 text-[14px] text-ink-dim">
                    {row.label === 'Source Type:' && (
                      <span className="grid size-[21px] place-items-center rounded-[3px] bg-[#f26522] text-[10px] font-bold text-white">
                        RS
                      </span>
                    )}
                    <span className="truncate">{row.value}</span>
                    {row.copy && <Copy className="size-[15px] shrink-0 text-ink-faint" />}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-10 space-y-10">
              <Section title="Source Information" />
              <Section title="Ingest Declaration" />
              <Section title="Virtual Source Associations" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="shrink-0 text-[15px] text-ink-strong">{title}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
