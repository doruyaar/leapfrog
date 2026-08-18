/**
 * The demo email channel. Real delivery is intentionally not wired up yet — that arrives
 * with a provider key when we move to production. Until then the product only *previews*
 * how a notification will look for a given subscription (see `previewNotification`), so
 * this sender deliberately sends nothing and writes nothing: no network, no `.eml` files.
 * It just reports, honestly, that demo mode does not deliver email — the channel-level
 * equivalent of the deterministic fallbacks the rest of the product guarantees.
 */
import type { EmailMessage, EmailSender, SendResult } from './types.js';

/** A no-op sender used with zero keys: nothing is sent and nothing is persisted. */
export function createPreviewSender(): EmailSender {
  return {
    channel: 'preview',
    async send(_message: EmailMessage): Promise<SendResult> {
      return {
        delivered: false,
        channel: 'preview',
        reason: 'demo mode — preview only; set RESEND_API_KEY to deliver email',
      };
    },
  };
}
