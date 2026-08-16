import 'server-only';
import { readChangeEvents } from '@leapfrog/core';
import { getDb } from './db';
import {
  getBattlecardVendors,
  getComparisonMatrix,
  getSignals,
  getVendors,
} from './queries';
import type { SearchGroup, SearchResponse, SearchResult } from './search-types';

/** How many hits each entity group shows — enough to be useful, few enough to scan. */
const PER_GROUP = 5;

/** Cut a detail line to a scannable length without slicing a word in half. */
function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function includesTerm(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * Search every entity in the product from one box. Insights and changes reuse the
 * SQL `LIKE` search the list pages already use; competitors, battlecards, and matrix
 * axes are small in-memory sets filtered by name. Results are grouped by entity kind
 * so the user can always see *what* each hit is and jump straight to its page.
 *
 * Returns empty groups (never throws) when the corpus is empty or the term is blank,
 * so the palette degrades gracefully in demo mode before `npm run seed`.
 */
export function searchAll(rawQuery: string): SearchResponse {
  const query = rawQuery.trim();
  if (!query) return { query, groups: [], total: 0 };

  const needle = query.toLowerCase();
  const groups: SearchGroup[] = [];

  // Insights (signals) — the primary feed.
  const insights: SearchResult[] = getSignals({ search: query, limit: PER_GROUP }).map(
    (s) => ({
      type: 'insight',
      key: `insight-${s.id}`,
      href: `/insights/${s.id}`,
      title: s.title,
      snippet: truncate(s.summary),
      meta: s.vendor ?? undefined,
      category: s.category,
    }),
  );
  if (insights.length) groups.push({ type: 'insight', label: 'Insights', results: insights });

  // Competitors — matched by name against the derived roster.
  const competitors: SearchResult[] = getVendors()
    .filter((v) => includesTerm(v.vendor, needle))
    .slice(0, PER_GROUP)
    .map((v) => ({
      type: 'competitor',
      key: `competitor-${v.slug}`,
      href: `/competitors/${v.slug}`,
      title: v.vendor,
      snippet: v.latestTitle ? truncate(v.latestTitle) : undefined,
      meta: `${v.signalCount} ${v.signalCount === 1 ? 'insight' : 'insights'}`,
    }));
  if (competitors.length)
    groups.push({ type: 'competitor', label: 'Competitors', results: competitors });

  // Battlecards — one per competitor the platform can position against.
  const battlecards: SearchResult[] = getBattlecardVendors()
    .filter((v) => includesTerm(v.name, needle))
    .slice(0, PER_GROUP)
    .map((v) => ({
      type: 'battlecard',
      key: `battlecard-${v.slug}`,
      href: `/battlecards/${v.slug}`,
      title: `${v.name} battlecard`,
      snippet: `How we compare against ${v.name}.`,
    }));
  if (battlecards.length)
    groups.push({ type: 'battlecard', label: 'Battlecards', results: battlecards });

  // Changes — link to the insight that triggered the change.
  const db = getDb();
  const changes: SearchResult[] = db
    ? readChangeEvents(db, { search: query })
        .slice(0, PER_GROUP)
        .map((c) => ({
          type: 'change',
          key: `change-${c.id}`,
          href: `/insights/${c.triggerItemId}`,
          title: `${c.vendor} — ${c.dimension}`,
          snippet: truncate(c.after),
          meta: c.kind,
        }))
    : [];
  if (changes.length) groups.push({ type: 'change', label: 'Changes', results: changes });

  // Matrix axes — jump to the comparison grid.
  const matrix = getComparisonMatrix();
  const axes: SearchResult[] = matrix.axes
    .filter((a) => includesTerm(a.label, needle) || includesTerm(a.description, needle))
    .slice(0, PER_GROUP)
    .map((a) => ({
      type: 'matrix',
      key: `matrix-${a.id}`,
      href: '/matrix',
      title: a.label,
      snippet: truncate(a.description),
    }));
  if (axes.length) groups.push({ type: 'matrix', label: 'Competitive Matrix', results: axes });

  const total = groups.reduce((sum, g) => sum + g.results.length, 0);
  return { query, groups, total };
}
