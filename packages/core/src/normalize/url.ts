/**
 * URL canonicalisation — half of the dedupe key (docs/DESIGN.md §5.2).
 *
 * The same story reaches us at many spellings of one address: a feed appends
 * campaign parameters, an aggregator links the `www.` host, a CMS emits a trailing
 * slash. Canonicalising before hashing means those all collapse onto one
 * `raw_items` row, so re-running the pipeline never duplicates an item and never
 * pays to enrich it twice.
 *
 * The rules are deliberately conservative: they only drop parts of a URL that
 * cannot change which document is served.
 */

/** Query parameters that only carry attribution — never document identity. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gbraid',
  'gclid',
  'igshid',
  'mkt_tok',
  'msclkid',
  'ref',
  'ref_src',
  'referrer',
  'wbraid',
  'yclid',
  '_hsenc',
  '_hsmi',
]);

/** Parameter prefixes from the usual campaign trackers (`utm_source`, `mc_cid`, …). */
const TRACKING_PREFIXES = ['utm_', 'mc_', 'mtm_', 'pk_', 'hsa_', 'at_'];

/** A URL an adapter handed us that cannot address an HTTP document. */
export class InvalidUrlError extends Error {
  constructor(
    readonly input: string,
    reason: string,
  ) {
    super(`cannot canonicalise "${input}": ${reason}`);
    this.name = 'InvalidUrlError';
  }
}

function isTracking(param: string): boolean {
  const key = param.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Canonicalise an absolute http(s) URL.
 *
 * Scheme and host are lower-cased, a leading `www.` and any default port are
 * dropped, the fragment is removed (it never reaches the server), tracking
 * parameters are stripped, surviving parameters are sorted so their order stops
 * mattering, and duplicate or trailing path slashes are collapsed.
 *
 * @throws InvalidUrlError when the input is unparseable or not http(s).
 */
export function canonicalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidUrlError(input, 'empty');

  // Feeds occasionally publish scheme-relative or bare-host links.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new InvalidUrlError(input, 'not a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError(input, `unsupported scheme "${url.protocol}"`);
  }
  if (!url.hostname) throw new InvalidUrlError(input, 'no host');

  const host = url.hostname.replace(/^www\./, '') + (url.port ? `:${url.port}` : '');

  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');

  const params = [...url.searchParams].filter(([key]) => !isTracking(key));
  params.sort(([aKey, aValue], [bKey, bValue]) =>
    aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
  );
  const query = new URLSearchParams(params).toString();

  return `${url.protocol}//${host}${path}${query ? `?${query}` : ''}`;
}
