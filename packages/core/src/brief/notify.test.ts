import { describe, expect, it, vi } from 'vitest';
import type { BriefItem } from './compose.js';
import { notifyHighImpact } from './notify.js';

function item(id: number, impact: number): BriefItem {
  return {
    id,
    title: `signal ${id}`,
    url: `https://example.test/${id}`,
    category: 'Security',
    vendor: 'Sonatype',
    impactScore: impact,
    summary: 's',
    whyItMatters: 'w',
    publishedAt: null,
    score: impact,
  };
}

describe('notifyHighImpact', () => {
  it('no-ops with no webhook configured', async () => {
    const result = await notifyHighImpact('2026-08-13', [item(1, 5)], { webhookUrl: '' });
    expect(result).toMatchObject({ delivered: false, reason: 'no webhook configured' });
  });

  it('no-ops when nothing meets the threshold', async () => {
    const fetchSpy = vi.fn();
    const result = await notifyHighImpact('2026-08-13', [item(1, 2)], {
      webhookUrl: 'https://hooks.slack.test/x',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    expect(result.delivered).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts only the high-impact signals to the webhook', async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    const result = await notifyHighImpact(
      '2026-08-13',
      [item(1, 5), item(2, 2), item(3, 4)],
      {
        webhookUrl: 'https://hooks.slack.test/x',
        fetch: fetchSpy as unknown as typeof fetch,
      },
    );

    expect(result).toEqual({ delivered: true, sent: 2 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as { text: string };
    expect(body.text).toContain('signal 1');
    expect(body.text).toContain('signal 3');
    expect(body.text).not.toContain('signal 2');
  });

  it('reports a non-2xx webhook response without throwing', async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 500 }));
    const result = await notifyHighImpact('2026-08-13', [item(1, 5)], {
      webhookUrl: 'https://hooks.slack.test/x',
      fetch: fetchSpy as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ delivered: false, reason: 'webhook returned 500' });
  });
});
