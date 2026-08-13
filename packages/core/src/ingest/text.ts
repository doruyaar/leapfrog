/** Text helpers shared by adapters: HTML flattening, truncation, date parsing. */

/** Feed bodies are stored as plain text; this bounds the worst offenders. */
export const MAX_CONTENT_CHARS = 12_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Flatten feed HTML to readable plain text. Block-level tags become newlines so
 * chunking later has structural boundaries to split on; everything else collapses
 * to single spaces.
 */
export function htmlToText(input: string): string {
  return decodeEntities(
    input
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|tr|section|article)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncate(input: string, maxChars = MAX_CONTENT_CHARS): string {
  return input.length <= maxChars ? input : `${input.slice(0, maxChars).trimEnd()}…`;
}

/** Parse a feed/API timestamp, returning `undefined` rather than an Invalid Date. */
export function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed);
}
