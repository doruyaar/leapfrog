import type { Category } from '@leapfrog/core';

/** Category → accent colour, used for pills and left-borders across the product. */
export const CATEGORY_COLOR: Record<Category, string> = {
  Security: '#c9302c',
  Product: '#3bc03f',
  Pricing: '#d9822b',
  Business: '#2f78d1',
  Ecosystem: '#8b5cf6',
};

/** Impact 1–5 → colour, hot to cool. Drives the impact badge. */
export function impactColor(score: number): string {
  if (score >= 5) return '#c9302c';
  if (score === 4) return '#e8791f';
  if (score === 3) return '#d9a521';
  if (score === 2) return '#6b93b8';
  return '#9aa0a6';
}

export function impactLabel(score: number): string {
  return (
    { 5: 'Act now', 4: 'High', 3: 'Medium', 2: 'Low', 1: 'Noise' }[score] ?? 'Unscored'
  );
}

/** Two-letter mark for a vendor, e.g. "Sonatype" → "SO". */
export function vendorInitials(vendor: string | null): string {
  if (!vendor) return '—';
  const parts = vendor.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return vendor.slice(0, 2).toUpperCase();
}

const MS_PER_DAY = 86_400_000;

/** Absolute date, e.g. "Aug 11, 2026". */
export function formatDate(value: Date | string | null): string {
  if (!value) return 'Undated';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Coarse relative age, e.g. "today", "3d ago", "2w ago". */
export function relativeAge(value: Date | string | null, now: Date = new Date()): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  const days = Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
