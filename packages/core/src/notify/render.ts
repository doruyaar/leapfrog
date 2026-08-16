/**
 * Render a subscription digest into an email. Groundedness carries over from the rest of
 * the product: every insight in the email links to its in-app detail page (`/insights/:id`)
 * and to its original source, and the footer states, in plain English, exactly why the
 * recipient got it — with a one-click way to manage or unsubscribe.
 */
import type { SignalSummary } from '../query/signals.js';
import { describeSubscription, type SubscriptionFilters } from './match.js';

/** The default app origin used to build deep links; `APP_BASE_URL` overrides. */
export const DEFAULT_BASE_URL = 'http://localhost:3000';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The subscription fields the renderer needs — a subset of `SubscriptionView`. */
export interface RenderSubscription extends SubscriptionFilters {
  label: string;
}

export interface RenderOptions {
  /** App origin for deep links; defaults to `APP_BASE_URL` then {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** True when `signals` are illustrative (a test send with no real matches yet). */
  sample?: boolean;
}

const IMPACT_COLORS: Record<number, string> = {
  5: '#c9302c',
  4: '#e8791f',
  3: '#d9a521',
  2: '#6b93b8',
  1: '#9aa0a6',
};

function impactColor(score: number): string {
  return IMPACT_COLORS[score] ?? '#9aa0a6';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveBaseUrl(explicit?: string): string {
  const base = explicit ?? process.env.APP_BASE_URL?.trim() ?? DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

function signalHtml(signal: SignalSummary, baseUrl: string): string {
  const detail = `${baseUrl}/insights/${signal.id}`;
  const meta = [signal.vendor, signal.category]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(' · ');
  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e6e8eb;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:top;width:34px;">
              <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:4px;color:#fff;font-weight:600;font-size:13px;background:${impactColor(
                signal.impactScore,
              )};">${signal.impactScore}</span>
            </td>
            <td style="vertical-align:top;">
              <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">${meta}</div>
              <a href="${detail}" style="font-size:16px;font-weight:600;color:#111827;text-decoration:none;">${escapeHtml(
                signal.title,
              )}</a>
              <p style="margin:6px 0 8px;font-size:13px;color:#374151;line-height:1.5;">
                <strong style="color:#2f6feb;">Why it matters — </strong>${escapeHtml(
                  signal.whyItMatters,
                )}
              </p>
              <div style="font-size:12px;">
                <a href="${detail}" style="color:#2f6feb;text-decoration:none;">View insight</a>
                <span style="color:#9aa0a6;">&nbsp;·&nbsp;</span>
                <a href="${escapeHtml(
                  signal.url,
                )}" style="color:#6b7280;text-decoration:none;">Original source</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function signalText(signal: SignalSummary, baseUrl: string): string {
  const meta = [signal.vendor, signal.category]
    .filter((v): v is string => Boolean(v))
    .join(' · ');
  return [
    `[${signal.impactScore}] ${signal.title}`,
    meta,
    `Why it matters — ${signal.whyItMatters}`,
    `${baseUrl}/insights/${signal.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Build the subject, HTML, and text bodies for a subscription's matched signals. */
export function renderSubscriptionEmail(
  subscription: RenderSubscription,
  signals: SignalSummary[],
  options: RenderOptions = {},
): RenderedEmail {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const manageUrl = `${baseUrl}/notifications`;
  const reason = describeSubscription(subscription);
  const count = signals.length;
  const noun = count === 1 ? 'signal' : 'signals';

  const subject = options.sample
    ? `LeapFrog · sample alert — ${subscription.label}`
    : `LeapFrog · ${count} ${noun} — ${subscription.label}`;

  const intro = options.sample
    ? `Nothing matches this subscription yet, so here is what an alert will look like. You are subscribed to <strong>${escapeHtml(
        reason,
      )}</strong>.`
    : `<strong>${count} ${noun}</strong> matched your subscription to <strong>${escapeHtml(
        reason,
      )}</strong>.`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e6e8eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#0f7d3d;padding:16px 24px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">LeapFrog</span>
                <span style="color:#bfe6cf;font-size:12px;">&nbsp;· competitive intelligence</span>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0;">
                <p style="margin:0 0 4px;font-size:13px;color:#374151;line-height:1.5;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  ${signals.map((s) => signalHtml(s, baseUrl)).join('')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 24px 24px;">
                <p style="margin:0;font-size:12px;color:#9aa0a6;line-height:1.6;">
                  You are receiving this because you subscribed to <strong>${escapeHtml(
                    reason,
                  )}</strong>.<br />
                  <a href="${manageUrl}" style="color:#2f6feb;text-decoration:none;">Manage or unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    options.sample
      ? `LeapFrog — sample alert for: ${reason}`
      : `LeapFrog — ${count} ${noun} for: ${reason}`,
    '',
    ...signals.map((s) => signalText(s, baseUrl)),
    '',
    `You are receiving this because you subscribed to: ${reason}`,
    `Manage or unsubscribe: ${manageUrl}`,
  ].join('\n');

  return { subject, html, text };
}
