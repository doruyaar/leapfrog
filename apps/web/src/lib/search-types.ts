import type { Category } from '@leapfrog/core';

/** The entity kinds the global search can return, in the order they are grouped. */
export type SearchResultType =
  | 'insight'
  | 'competitor'
  | 'battlecard'
  | 'change'
  | 'matrix';

/** One hit, already shaped for display and safe to send to the client. */
export interface SearchResult {
  type: SearchResultType;
  /** Stable key within the results list. */
  key: string;
  /** Where clicking the result takes the user. */
  href: string;
  /** The result's headline — matches the page name it links to. */
  title: string;
  /** A truncated detail line (e.g. an insight's summary). */
  snippet?: string;
  /** A short right-aligned tag, e.g. a vendor name or date. */
  meta?: string;
  /** Drives the colour dot when the result carries a category. */
  category?: Category;
}

/** Results for one entity kind, ready to render under a heading. */
export interface SearchGroup {
  type: SearchResultType;
  /** Plain, obvious heading, e.g. "Insights". */
  label: string;
  results: SearchResult[];
}

/** The full response for a query: grouped hits plus a total count. */
export interface SearchResponse {
  query: string;
  groups: SearchGroup[];
  total: number;
}
