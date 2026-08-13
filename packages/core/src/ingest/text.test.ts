import { describe, expect, it } from 'vitest';
import { htmlToText, parseDate, truncate } from './text.js';

describe('htmlToText', () => {
  it('keeps block structure and drops markup', () => {
    const html =
      '<h2>Title</h2><p>First &amp; best.</p><ul><li>One</li><li>Two</li></ul>';

    expect(htmlToText(html)).toBe('Title\n\nFirst & best.\n\n- One\n- Two');
  });

  it('removes scripts, styles, and comments', () => {
    const html = '<style>.a{}</style><script>alert(1)</script><!-- note --><p>Body</p>';

    expect(htmlToText(html)).toBe('Body');
  });

  it('decodes numeric and named entities', () => {
    expect(htmlToText('caf&#233; &mdash; &#x1F600; &nbsp;done')).toBe('café — 😀 done');
  });
});

describe('truncate', () => {
  it('leaves short text untouched and marks clipped text', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('abcdefghij', 4)).toBe('abcd…');
  });
});

describe('parseDate', () => {
  it('parses RFC 822 and ISO timestamps', () => {
    expect(parseDate('Wed, 12 Aug 2026 09:30:00 +0000')?.toISOString()).toBe(
      '2026-08-12T09:30:00.000Z',
    );
    expect(parseDate('2026-08-13T10:00:00Z')?.toISOString()).toBe(
      '2026-08-13T10:00:00.000Z',
    );
  });

  it('returns undefined for junk instead of an Invalid Date', () => {
    expect(parseDate('last tuesday')).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
    expect(parseDate('')).toBeUndefined();
  });
});
