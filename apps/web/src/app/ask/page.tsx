import type { Metadata } from 'next';
import { AskChat } from '@/components/ask/ask-chat';

export const metadata: Metadata = { title: 'Ask LeapFrog' };

export default function AskPage() {
  return (
    <div className="flex h-full min-h-0 flex-col px-[34px] pb-6 pt-5">
      <AskChat />
    </div>
  );
}
