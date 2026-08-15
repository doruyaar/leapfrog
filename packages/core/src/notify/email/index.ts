/**
 * Pick the email channel the same way models are picked elsewhere: from config, not
 * code. A live `RESEND_API_KEY` selects the real provider; its absence falls back to
 * the local `.eml` outbox so the feature always works with zero keys.
 */
import { createOutboxSender } from './outbox.js';
import { createResendSender } from './resend.js';
import type { EmailSender } from './types.js';

export interface ResolveSenderOptions {
  /** An explicit sender (tests, or a caller that already built one) wins. */
  sender?: EmailSender;
}

/** The configured email sender: Resend when a key is set, else the file outbox. */
export function resolveEmailSender(options: ResolveSenderOptions = {}): EmailSender {
  if (options.sender) return options.sender;
  if (process.env.RESEND_API_KEY?.trim()) return createResendSender();
  return createOutboxSender();
}

export { createResendSender, DEFAULT_FROM, type ResendOptions } from './resend.js';
export { createOutboxSender, resolveOutboxDir, type OutboxOptions } from './outbox.js';
export type { EmailMessage, EmailSender, SendResult } from './types.js';
