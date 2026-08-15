/**
 * The demo email channel: write each message to `data/outbox` as both a real `.eml`
 * (opens in Apple Mail / Outlook) and a plain `.html` twin (double-click → opens in the
 * browser, which renders it perfectly without a mail app). Zero API keys, no network —
 * the channel-level equivalent of the deterministic fallbacks the rest of the product
 * guarantees.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDatabasePath } from '../../db/client.js';
import { DEFAULT_FROM } from './resend.js';
import type { EmailMessage, EmailSender, SendResult } from './types.js';

/** Where `.eml` files land; `NOTIFY_OUTBOX_DIR` overrides, else `data/outbox`. */
export function resolveOutboxDir(): string {
  // `resolveDatabasePath` anchors a relative path to the workspace root, which is
  // exactly the resolution the outbox needs (a sibling of `data/leapfrog.sqlite`).
  return resolveDatabasePath(process.env.NOTIFY_OUTBOX_DIR?.trim() || 'data/outbox');
}

export interface OutboxOptions {
  /** Target directory; defaults to {@link resolveOutboxDir}. */
  dir?: string;
  /** From header; defaults to `NOTIFY_EMAIL_FROM` then the Resend test sender. */
  from?: string;
  /** Clock, for deterministic filenames in tests. */
  now?: () => Date;
  /** Also write a browser-openable `.html` twin next to the `.eml` (default true). */
  html?: boolean;
}

/** A filesystem-safe slug from the subject line, for a readable filename. */
function slugify(subject: string): string {
  return (
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'notification'
  );
}

/** A minimal, valid single-part HTML MIME message. */
function toEml(message: EmailMessage, from: string, at: Date): string {
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Date: ${at.toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${message.html}\r\n`;
}

export function createOutboxSender(options: OutboxOptions = {}): EmailSender {
  const from = options.from ?? process.env.NOTIFY_EMAIL_FROM?.trim() ?? DEFAULT_FROM;
  const clock = options.now ?? (() => new Date());

  return {
    channel: 'outbox',
    async send(message: EmailMessage): Promise<SendResult> {
      try {
        const dir = options.dir ?? resolveOutboxDir();
        mkdirSync(dir, { recursive: true });
        const at = clock();
        const stamp = at.toISOString().replace(/[:.]/g, '-');
        const base = join(dir, `${stamp}-${slugify(message.subject)}`);
        const file = `${base}.eml`;
        writeFileSync(file, toEml(message, from, at), 'utf8');
        // The `.html` twin renders in any browser — the demo's one-click preview.
        if (options.html !== false) writeFileSync(`${base}.html`, message.html, 'utf8');
        return { delivered: true, channel: 'outbox', ref: file };
      } catch (error) {
        return {
          delivered: false,
          channel: 'outbox',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
