'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light mode' : 'Switch to night mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to night mode'}
      className="grid size-[31px] place-items-center rounded-full text-chrome-ink-dim transition-colors hover:bg-chrome-hover hover:text-chrome-ink"
    >
      {isDark ? (
        <Sun className="size-[19px]" strokeWidth={1.9} />
      ) : (
        <Moon className="size-[19px]" strokeWidth={1.9} />
      )}
    </button>
  );
}
