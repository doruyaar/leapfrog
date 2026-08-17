import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Sidebar } from '@/components/chrome/sidebar';
import { TopBar } from '@/components/chrome/top-bar';
import { ThemeProvider } from '@/components/chrome/theme-provider';
import { ScrollToTop } from '@/components/chrome/scroll-to-top';
import { ChatProvider } from '@/components/ask/chat-provider';
import { ChatDrawer } from '@/components/ask/chat-drawer';
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
          <ChatProvider>
            {/* Suspense: useSearchParams inside would otherwise block static prerendering. */}
            <Suspense fallback={null}>
              <ScrollToTop targetId="main-scroll" />
            </Suspense>
            {/* overflow-clip (not hidden): a hidden box can still be scrolled by
                Next's scrollIntoView on navigation, pushing the top bar offscreen. */}
            <div className="flex h-screen flex-col overflow-clip">
              <TopBar />
              <div className="flex min-h-0 flex-1">
                <Sidebar />
                <main
                  id="main-scroll"
                  className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-canvas"
                >
                  {children}
                </main>
              </div>
            </div>
            {/* Right-side assistant panel; overlays the content when opened. */}
            <ChatDrawer />
          </ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
