/**
 * Pick the email channel the same way models are picked elsewhere: from config, not
 * code. A live `RESEND_API_KEY` selects the real provider; its absence falls back to the
 * no-op preview channel — demo mode never sends or stores email, it only lets you preview
 * how a notification will look in the app.
 */
import { createPreviewSender } from './preview.js';
import { createResendSender } from './resend.js';
import type { EmailSender } from './types.js';

export interface ResolveSenderOptions {
  /** An explicit sender (tests, or a caller that already built one) wins. */
  sender?: EmailSender;
}

/** The configured email sender: Resend when a key is set, else the no-op preview channel. */
export function resolveEmailSender(options: ResolveSenderOptions = {}): EmailSender {
  if (options.sender) return options.sender;
  if (process.env.RESEND_API_KEY?.trim()) return createResendSender();
  return createPreviewSender();
}

export { createResendSender, DEFAULT_FROM, type ResendOptions } from './resend.js';
export { createPreviewSender } from './preview.js';
export type { EmailMessage, EmailSender, SendResult } from './types.js';
