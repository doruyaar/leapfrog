/**
 * The alert hook (docs/DESIGN.md §5, step 6): push the brief's high-impact signals to a
 * Slack incoming webhook. In-app inbox is always the baseline; Slack is opt-in and
 * degrades gracefully — no `SLACK_WEBHOOK_URL`, or nothing above the threshold, is a
 * clean no-op, never an error. `fetch` is injectable so the notifier is testable offline.
 */
import type { BriefItem } from './compose.js';

/** Impact at or above which a signal is worth interrupting someone for. */
export const ALERT_THRESHOLD = 4;

export interface NotifyOptions {
  /** Slack incoming-webhook URL; defaults to `SLACK_WEBHOOK_URL`. */
  webhookUrl?: string;
  /** Minimum impact score to alert on. */
  threshold?: number;
  /** Injected fetch for tests; defaults to the global. */
  fetch?: typeof fetch;
}

export interface NotifyResult {
  delivered: boolean;
  /** Number of signals that met the threshold. */
  sent: number;
  /** Why nothing was delivered, when `delivered` is false. */
  reason?: string;
}

/**
 * The link line for an item, honouring its verification verdict: a link is only
 * committed to the alert once it is confirmed to resolve to a relevant page. An
 * unreachable or off-topic URL is labelled instead of shipped, so we never send a
 * source we could not stand behind.
 */
function linkLine(item: BriefItem): string {
  switch (item.urlStatus) {
    case 'unreachable':
      return `  ⚠ source link unreachable, not linked (${item.url})`;
    case 'irrelevant':
      return `  ⚠ source link did not resolve to a relevant page, not linked (${item.url})`;
    default:
      return `  ${item.url}`;
  }
}

/** Render the Slack message body for the high-impact signals. */
function formatMessage(briefDate: string, items: BriefItem[]): string {
  const lines = items.map(
    (item) =>
      `• *[impact ${item.impactScore}] ${item.title}*` +
      (item.vendor ? ` — ${item.vendor}` : '') +
      `\n  ${item.whyItMatters}\n${linkLine(item)}`,
  );
  return `:frog: *LeapFrog brief — ${briefDate}* — ${items.length} high-impact insight(s)\n\n${lines.join('\n')}`;
}

/**
 * Post the brief's signals at or above `threshold` to Slack. Returns what happened so a
 * caller can log it; absence of a webhook or of qualifying items is reported, not thrown.
 */
export async function notifyHighImpact(
  briefDate: string,
  items: BriefItem[],
  options: NotifyOptions = {},
): Promise<NotifyResult> {
  const webhookUrl = options.webhookUrl ?? process.env.SLACK_WEBHOOK_URL?.trim();
  const threshold = options.threshold ?? ALERT_THRESHOLD;
  const highImpact = items.filter((item) => item.impactScore >= threshold);

  if (!webhookUrl) {
    return { delivered: false, sent: highImpact.length, reason: 'no webhook configured' };
  }
  if (highImpact.length === 0) {
    return { delivered: false, sent: 0, reason: `no insights at impact ${threshold}+` };
  }

  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: formatMessage(briefDate, highImpact) }),
    });
    if (!response.ok) {
      return {
        delivered: false,
        sent: highImpact.length,
        reason: `webhook returned ${response.status}`,
      };
    }
    return { delivered: true, sent: highImpact.length };
  } catch (error) {
    return {
      delivered: false,
      sent: highImpact.length,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
