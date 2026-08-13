import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/chrome/sidebar';
import { TopBar } from '@/components/chrome/top-bar';
import { ThemeProvider } from '@/components/chrome/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LeapFrog Platform',
    template: '%s · LeapFrog',
  },
  description: 'Competitive-intelligence platform for the software-supply-chain market.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="flex h-screen flex-col overflow-hidden">
            <TopBar />
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <main className="min-w-0 flex-1 overflow-y-auto bg-canvas">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
