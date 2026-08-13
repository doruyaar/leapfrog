'use client';

import { useState } from 'react';
import { Download, Check } from 'lucide-react';

/**
 * Download the battlecard as a `.md` file. The Markdown is composed server-side and passed
 * in, so the button just wraps it in a Blob — the card can leave the app for a CRM or deck
 * without a round-trip.
 */
export function ExportButton({
  markdown,
  filename,
}: {
  markdown: string;
  filename: string;
}) {
  const [done, setDone] = useState(false);

  function download() {
    const blob = new Blob([`${markdown}\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex h-[36px] items-center gap-2 rounded-[4px] bg-accent px-3.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
    >
      {done ? <Check className="size-4" /> : <Download className="size-4" />}
      {done ? 'Downloaded' : 'Export Markdown'}
    </button>
  );
}
