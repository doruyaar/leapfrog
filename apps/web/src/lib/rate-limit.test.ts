import { describe, expect, it } from 'vitest';
import { allowGlobal, allowRequest, clientKey } from './rate-limit';

/** A Request carrying a given X-Forwarded-For header (or none). */
function req(forwardedFor?: string): Request {
  const headers = new Headers();
  if (forwardedFor !== undefined) headers.set('x-forwarded-for', forwardedFor);
  return new Request('http://localhost/api/ask', { method: 'POST', headers });
}

describe('clientKey', () => {
  it('falls back to a fixed key when no forwarding header is present', () => {
    expect(clientKey(req())).toBe('local');
    expect(clientKey(req(''))).toBe('local');
  });

  it('trusts the proxy-appended LAST hop, not the client-supplied first hop', () => {
    // Render appends the real client IP last; the leftmost value is attacker-controlled.
    expect(clientKey(req('9.9.9.9'))).toBe('9.9.9.9');
    expect(clientKey(req('spoofed, 203.0.113.7'))).toBe('203.0.113.7');
    expect(clientKey(req('a, b, 203.0.113.7'))).toBe('203.0.113.7');
  });

  it('cannot be bypassed by rotating the leftmost hop', () => {
    // Same real client (last hop) → same key regardless of what it prepends.
    const a = clientKey(req('rand-1, 203.0.113.7'));
    const b = clientKey(req('rand-2, 203.0.113.7'));
    expect(a).toBe(b);
  });
});

describe('allowRequest', () => {
  it('permits up to the per-key budget, then blocks within the window', () => {
    const key = `key-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) expect(allowRequest(key, 3, 60_000)).toBe(true);
    expect(allowRequest(key, 3, 60_000)).toBe(false);
  });

  it('resets once the window elapses', () => {
    const key = `key-${Math.random()}`;
    expect(allowRequest(key, 1, 1)).toBe(true);
    expect(allowRequest(key, 1, 1)).toBe(false);
    return new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
      expect(allowRequest(key, 1, 1)).toBe(true);
    });
  });
});

describe('allowGlobal', () => {
  it('caps total requests across all clients within a window', () => {
    // A short custom window isolates this from other tests sharing the module state.
    for (let i = 0; i < 3; i += 1) expect(allowGlobal(3, 60_000)).toBe(true);
    expect(allowGlobal(3, 60_000)).toBe(false);
  });
});
