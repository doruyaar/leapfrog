'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * The app scrolls inside the <main> container rather than the window, so Next's
 * default scroll handling keeps the previous offset across navigations. Worse,
 * when the container is scrolled down Next calls scrollIntoView() on the new
 * page content, which also scrolls the overflow-hidden app shell and pushes the
 * top bar out of view. Reset the container and every ancestor on each
 * pathname change.
 */
export function ScrollToTop({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  // Pagination, filters, and sort are query-string navigations on the same
  // pathname, so key the reset on the search params as well.
  const search = useSearchParams().toString();

  useEffect(() => {
    const el = document.getElementById(targetId);
    el?.scrollTo({ top: 0, left: 0 });
    let node = el?.parentElement ?? null;
    while (node) {
      node.scrollTop = 0;
      node.scrollLeft = 0;
      node = node.parentElement;
    }
    window.scrollTo(0, 0);
  }, [pathname, search, targetId]);

  return null;
}
