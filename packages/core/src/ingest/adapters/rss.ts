/**
 * RSS 2.0 / RSS 1.0 (RDF) / Atom adapter — vendor blogs, release notes, press feeds.
 *
 * One adapter covers all three dialects because they differ only in where the
 * entry list and its fields live; feeds in the wild also mix them (WordPress emits
 * RSS with Atom links). Entries missing a title or link are skipped with a warning
 * rather than failing the whole source.
 */
import { XMLParser } from 'fast-xml-parser';
import { fetchText } from '../http.js';
import { toResult } from '../shared.js';
import { htmlToText, parseDate, truncate } from '../text.js';
import type {
  FetchContext,
  FetchResult,
  FetchedItem,
  SourceAdapter,
  SourceInput,
} from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Keep every value a string: feed GUIDs and dates must not become numbers.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type XmlNode = Record<string, unknown>;

/** Feed values arrive as a string, a `{ '#text': ... }` node, or a repeated list. */
function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (value && typeof value === 'object') return textOf((value as XmlNode)['#text']);
  return undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstDefined(node: XmlNode, keys: string[]): unknown {
  for (const key of keys) {
    if (node[key] !== undefined) return node[key];
  }
  return undefined;
}

/** Atom links are attribute-only nodes; prefer `rel="alternate"` over enclosures. */
function linkOf(node: XmlNode): string | undefined {
  const candidates = asArray(node.link);

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const link = candidate as XmlNode;
      const rel = link['@_rel'];
      const href = link['@_href'];
      if (typeof href === 'string' && (rel === undefined || rel === 'alternate'))
        return href;
    }
  }

  const guid = textOf(node.guid) ?? textOf(node.id);
  return guid?.startsWith('http') ? guid : undefined;
}

/** RSS uses `dc:creator`/`author` strings; Atom nests the name in `author.name`. */
function authorOf(entry: XmlNode): string | undefined {
  const author = firstDefined(entry, ['dc:creator', 'author']);
  if (author && typeof author === 'object' && !Array.isArray(author)) {
    return textOf((author as XmlNode).name) ?? textOf(author);
  }
  return textOf(author);
}

function entriesOf(document: XmlNode): unknown[] {
  const rss = document.rss as XmlNode | undefined;
  const rdf = (document['rdf:RDF'] ?? document.RDF) as XmlNode | undefined;
  const feed = document.feed as XmlNode | undefined;

  if (rss?.channel) return asArray((rss.channel as XmlNode).item);
  if (rdf) return asArray(rdf.item ?? (rdf.channel as XmlNode | undefined)?.item);
  if (feed) return asArray(feed.entry);
  return [];
}

function toItem(entry: XmlNode): FetchedItem | undefined {
  const title = textOf(entry.title);
  const url = linkOf(entry);
  if (!title || !url) return undefined;

  const body =
    textOf(
      firstDefined(entry, ['content:encoded', 'content', 'description', 'summary']),
    ) ?? '';

  return {
    externalId: textOf(entry.guid) ?? textOf(entry.id),
    url,
    title: htmlToText(title),
    author: authorOf(entry),
    content: truncate(htmlToText(body)),
    publishedAt: parseDate(
      textOf(firstDefined(entry, ['pubDate', 'published', 'dc:date', 'updated'])),
    ),
    raw: entry,
  };
}

export const rssAdapter: SourceAdapter = {
  kind: 'rss',
  locatorHint: 'Feed URL, e.g. https://jfrog.com/blog/feed/',

  async fetch(source: SourceInput, context: FetchContext = {}): Promise<FetchResult> {
    const xml = await fetchText(
      source.url,
      {
        headers: {
          accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9',
        },
      },
      context.http,
    );

    const document = parser.parse(xml) as XmlNode;
    const entries = entriesOf(document);
    const warnings: string[] = [];

    if (entries.length === 0) {
      warnings.push(
        `no RSS/Atom entries found at ${source.url} — feed shape may have changed`,
      );
    }

    const items: FetchedItem[] = [];
    for (const entry of entries) {
      const item =
        entry && typeof entry === 'object' ? toItem(entry as XmlNode) : undefined;
      if (item) items.push(item);
      else warnings.push(`skipped an entry without a usable title/link in ${source.url}`);
    }

    return toResult(source, items, warnings, context);
  },
};
