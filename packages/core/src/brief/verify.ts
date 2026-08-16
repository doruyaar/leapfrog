/**
 * URL verification for the brief (docs/DESIGN.md §5, step 5).
 *
 * A citation is only trustworthy if its link actually resolves to the page the claim
 * came from. Before the brief "commits" an item's URL — persisting it, linking it in the
 * UI, or pushing it to Slack — a {@link UrlVerifier} confirms two things: the URL is
 * reachable, and the page it returns is plausibly *about* the item (its title/vendor
 * terms appear in the fetched document). A link that 404s, redirects to a parked domain,
 * or lands on an unrelated page is flagged, never silently shown as a source.
 *
 * Verification is I/O and therefore injected: demo mode composes with no verifier at all
 * (every item stays `unverified`, and nothing on disk requires the network), while live
 * mode opts in. `fetch` flows through the shared retrying HTTP client so the whole thing
 * is unit-testable offline.
 */
import { fetchWithRetry, HttpError, type HttpOptions } from '../ingest/http.js';

/**
 * The trust verdict for one item's link.
 * - `verified`   — reachable and the page matches the item.
 * - `unverified` — not checked (demo mode, or verification skipped).
 * - `unreachable`— the URL did not return a usable response.
 * - `irrelevant` — reachable, but the page is not about the item.
 */
export type UrlStatus = 'verified' | 'unverified' | 'unreachable' | 'irrelevant';

/** The minimum fraction of an item's significant title terms a page must contain. */
export const RELEVANCE_THRESHOLD = 0.5;

/** Cap on how much of a fetched page we scan for relevance terms. */
const MAX_SCAN_CHARS = 200_000;

/** The fields of an item a verifier needs to judge reachability and relevance. */
export interface VerifiableItem {
  url: string;
  title: string;
  vendor: string | null;
}

/**
 * Confirms an item's URL resolves to a relevant page. Depend on this interface, not on
 * `fetch`, so the composer stays testable and demo mode can omit verification entirely.
 */
export interface UrlVerifier {
  verify(item: VerifiableItem): Promise<UrlStatus>;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'into',
  'over',
  'your',
  'new',
  'now',
  'how',
  'why',
  'what',
  'when',
  'will',
  'has',
  'have',
  'are',
  'was',
  'its',
  'about',
]);

/** Lowercased, de-duplicated tokens (length ≥ 4, non-stopword) worth matching on. */
export function significantTerms(...parts: Array<string | null | undefined>): string[] {
  const terms = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const token of part.toLowerCase().match(/[a-z0-9][a-z0-9.+-]{3,}/g) ?? []) {
      if (!STOP_WORDS.has(token)) terms.add(token);
    }
  }
  return [...terms];
}

/**
 * Decide relevance from a fetched page's text: the vendor (when named) must appear, and
 * at least {@link RELEVANCE_THRESHOLD} of the title's significant terms must be present.
 * The vendor gate keeps a generic index page from passing on incidental word overlap.
 */
export function pageMatchesItem(pageText: string, item: VerifiableItem): boolean {
  const haystack = pageText.slice(0, MAX_SCAN_CHARS).toLowerCase();
  if (item.vendor) {
    const vendorTerms = significantTerms(item.vendor);
    const vendorHit =
      vendorTerms.length === 0 || vendorTerms.some((t) => haystack.includes(t));
    if (!vendorHit) return false;
  }

  const terms = significantTerms(item.title);
  if (terms.length === 0) return true;
  const hits = terms.filter((t) => haystack.includes(t)).length;
  return hits / terms.length >= RELEVANCE_THRESHOLD;
}

/**
 * A verifier that fetches each URL and checks it resolves to a relevant page. Network
 * failures and non-2xx responses become `unreachable`; a reachable but off-topic page
 * becomes `irrelevant`. Never throws — an unverifiable link is a verdict, not an error.
 */
export function createHttpUrlVerifier(http: HttpOptions = {}): UrlVerifier {
  return {
    async verify(item: VerifiableItem): Promise<UrlStatus> {
      let text: string;
      try {
        const response = await fetchWithRetry(item.url, { redirect: 'follow' }, http);
        text = await response.text();
      } catch (error) {
        if (error instanceof HttpError) return 'unreachable';
        return 'unreachable';
      }
      return pageMatchesItem(text, item) ? 'verified' : 'irrelevant';
    },
  };
}
