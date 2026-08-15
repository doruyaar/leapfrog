/**
 * The email delivery seam. Everything that sends a notification depends on this
 * interface, never on a concrete provider — so tests inject a stub, the demo writes
 * to a local outbox with zero keys, and live mode posts to a provider, all behind one
 * call. Same dependency-injection contract as `Embedder` / `EnrichmentModel`.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  /** Rich HTML body (email clients need inline styles). */
  html: string;
  /** Plain-text fallback body. */
  text: string;
}

export interface SendResult {
  delivered: boolean;
  /** Which channel handled (or would have handled) the send. */
  channel: string;
  /** Where it went: a provider message id, or the outbox file path. */
  ref?: string;
  /** Why nothing was delivered, when `delivered` is false. */
  reason?: string;
}

export interface EmailSender {
  /** Stable channel name for logs and results, e.g. `resend` or `outbox`. */
  readonly channel: string;
  send(message: EmailMessage): Promise<SendResult>;
}
