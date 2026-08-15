/**
 * The live email channel: a single `fetch` POST to Resend's HTTP API, gated on
 * `RESEND_API_KEY`. Deliberately the same shape as the Slack notifier
 * (`brief/notify.ts`) — injectable `fetch`, graceful degradation, no SDK — so email
 * adds zero dependencies and the "one env var flips demo → live" story matches
 * `OPENROUTER_API_KEY`.
 *
 * Free-tier note: without a verified domain Resend only delivers to the account's own
 * address from `onboarding@resend.dev`; that is exactly the single-recipient demo case.
 */
import type { EmailMessage, EmailSender, SendResult } from './types.js';

/** Sender address used when `NOTIFY_EMAIL_FROM` is unset — Resend's test sender. */
export const DEFAULT_FROM = 'LeapFrog <onboarding@resend.dev>';

export interface ResendOptions {
  /** Resend API key; defaults to `RESEND_API_KEY`. */
  apiKey?: string;
  /** From address; defaults to `NOTIFY_EMAIL_FROM` then `DEFAULT_FROM`. */
  from?: string;
  /** Injected fetch for tests; defaults to the global. */
  fetch?: typeof fetch;
}

export function createResendSender(options: ResendOptions = {}): EmailSender {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY?.trim();
  const from = options.from ?? process.env.NOTIFY_EMAIL_FROM?.trim() ?? DEFAULT_FROM;
  const doFetch = options.fetch ?? fetch;

  return {
    channel: 'resend',
    async send(message: EmailMessage): Promise<SendResult> {
      if (!apiKey) {
        return { delivered: false, channel: 'resend', reason: 'no RESEND_API_KEY' };
      }

      try {
        const response = await doFetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });

        if (!response.ok) {
          return {
            delivered: false,
            channel: 'resend',
            reason: `resend returned ${response.status}`,
          };
        }

        let ref: string | undefined;
        try {
          const data = (await response.json()) as { id?: string };
          ref = data.id;
        } catch {
          // A 2xx with an unparseable body still counts as delivered.
        }
        return { delivered: true, channel: 'resend', ref };
      } catch (error) {
        return {
          delivered: false,
          channel: 'resend',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
