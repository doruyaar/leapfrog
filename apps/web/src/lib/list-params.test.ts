import { describe, expect, it } from 'vitest';
import { buildQuery, pageWindow, paginate, parsePage } from './list-params';

describe('parsePage', () => {
  it('defaults to 1 for missing or bad input', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-4')).toBe(1);
  });

  it('parses a valid page number', () => {
    expect(parsePage('3')).toBe(3);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('slices the requested page and reports counters', () => {
    const page = paginate(items, 2, 10);
    expect(page.items).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(page).toMatchObject({ page: 2, totalPages: 3, total: 25, from: 11, to: 20 });
  });

  it('clamps a too-large page back into range', () => {
    const page = paginate(items, 99, 10);
    expect(page.page).toBe(3);
    expect(page.items).toEqual([21, 22, 23, 24, 25]);
    expect(page).toMatchObject({ from: 21, to: 25 });
  });

  it('reports a zeroed range for an empty list', () => {
    const page = paginate([], 1, 10);
    expect(page).toMatchObject({ total: 0, totalPages: 1, from: 0, to: 0 });
    expect(page.items).toEqual([]);
  });
});

describe('buildQuery', () => {
  it('merges overrides and drops empty values', () => {
    expect(buildQuery({ q: 'cve', page: '2' }, { page: undefined })).toBe('?q=cve');
    expect(buildQuery({ q: 'cve' }, { category: 'Security' })).toBe(
      '?category=Security&q=cve',
    );
    expect(buildQuery({}, {})).toBe('');
  });

  it('orders keys stably for cache-friendly links', () => {
    expect(buildQuery({ z: '1', a: '2' })).toBe('?a=2&z=1');
  });
});

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('inserts gaps around a middle page', () => {
    expect(pageWindow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
  });

  it('keeps the first pages contiguous near the start', () => {
    expect(pageWindow(2, 12)).toEqual([1, 2, 3, null, 12]);
  });
});
