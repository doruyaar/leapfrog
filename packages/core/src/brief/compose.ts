/**
 * Composing the daily brief's cited executive summary (docs/DESIGN.md §5, step 5).
 *
 * Trust is the product, so the summary obeys three rules regardless of who writes it:
 *
 * 1. **Every claim is quoted and cited.** A claim carries the id of the item it rests on
 *    (`[#<id>]`) *and* a verbatim quote from that source, so no conclusion is shown
 *    without the exact text behind it.
 * 2. **Conflicts are surfaced, never resolved.** When sources disagree, the brief shows
 *    both sides with their sources instead of guessing — a false certainty is worse than
 *    a labelled unknown.
 * 3. **Cited links are verified before they are committed.** An item's URL is only shown
 *    as a source once it is confirmed to resolve to a relevant page.
 *
 * In demo mode there is no key, so a deterministic **extractive** summary is stitched from
 * the top signals' own grounded text and conflicts come from the stored change history.
 * In live mode a {@link BriefSummarizer} may write it — but its output is fully validated
 * (citations resolve, quotes are grounded, conflicts cite ≥2 sources) and any failure
 * falls back to the extractive summary rather than shipping an unchecked claim.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Category } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { changeEvents, rawItems, vendorFacts } from '../db/schema.js';
import { rankSignals, type RankedSignal } from './rank.js';
import type { UrlStatus, UrlVerifier } from './verify.js';

/** Bump when the extractive summary wording or the brief contract changes. */
export const BRIEF_PROMPT_VERSION = 'brief@2';

/** Model label stored on an extractively-composed brief (no LLM involved). */
export const EXTRACTIVE_MODEL = 'extractive';

/** One ranked item as stored in `briefs.items` (JSON) and rendered by the UI. */
export interface BriefItem {
  id: number;
  title: string;
  url: string;
  category: Category;
  vendor: string | null;
  impactScore: number;
  summary: string;
  whyItMatters: string;
  publishedAt: string | null;
  score: number;
  /** Verification verdict for `url`; absent means it was never checked (demo mode). */
  urlStatus?: UrlStatus;
}

/**
 * One grounded claim in the summary: a conclusion, the source it cites, and the verbatim
 * quote from that source that supports it. Quote-plus-citation is what makes every
 * sentence in the brief auditable back to where it is actually written.
 */
export interface BriefClaim {
  /** The conclusion, in the brief's own words. */
  text: string;
  /** The `raw_items.id` this claim rests on; present in the brief's item set. */
  sourceId: number;
  /** A verbatim excerpt from that source that supports the claim. */
  quote: string;
}

/**
 * An unresolved disagreement between sources. The brief presents each side with its own
 * citation and quote rather than choosing a winner, so the reader — not the pipeline —
 * decides. `sides` always names at least two distinct sources.
 */
export interface BriefConflict {
  /** What the sources disagree about, e.g. `Sonatype — pricing`. */
  topic: string;
  /** Each competing account, grounded in its own source. */
  sides: BriefClaim[];
  /** Why this is surfaced rather than resolved. */
  note: string;
}

export interface ComposedBrief {
  briefDate: string;
  summary: string;
  items: BriefItem[];
  /** The summary decomposed into grounded, cited, quoted claims. */
  claims: BriefClaim[];
  /** Contradictions between sources, surfaced for the reader to resolve. */
  conflicts: BriefConflict[];
  model: string | null;
  promptVersion: string | null;
}

/** What a live summarizer returns; every field is validated before it is trusted. */
export interface BriefDraft {
  summary: string;
  claims: BriefClaim[];
  conflicts: BriefConflict[];
}

/** The quotable source text a summarizer needs to ground its claims. */
export interface BriefSource extends BriefItem {
  /** The raw item body, the ground truth a quote must be drawn from. */
  content: string;
}

/** Optional live summarizer; its output is always validated by the composer. */
export interface BriefSummarizer {
  readonly model: string;
  readonly promptVersion: string;
  summarize(sources: BriefSource[]): Promise<BriefDraft>;
}

function toBriefItem(signal: RankedSignal): BriefItem {
  return {
    id: signal.id,
    title: signal.title,
    url: signal.url,
    category: signal.category,
    vendor: signal.vendor,
    impactScore: signal.impactScore,
    summary: signal.summary,
    whyItMatters: signal.whyItMatters,
    publishedAt: signal.publishedAt ? signal.publishedAt.toISOString() : null,
    score: Math.round(signal.score * 1000) / 1000,
  };
}

/** All `[#<id>]` citations referenced in a piece of summary text. */
export function extractCitations(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(/\[#(\d+)\]/g)) ids.add(Number(match[1]));
  return [...ids];
}

/** True when every citation in `summary` points at an item present in `items`. */
export function citationsAreValid(summary: string, items: BriefItem[]): boolean {
  const present = new Set(items.map((item) => item.id));
  return extractCitations(summary).every((id) => present.has(id));
}

/** Collapse whitespace and case so a quote is matched by meaning, not by formatting. */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The shortest quote we accept, so a one-word "quote" cannot pass as grounding. */
const MIN_QUOTE_CHARS = 8;

/**
 * True when `quote` is a verbatim excerpt of `sourceText` (ignoring whitespace and case).
 * This is the groundedness gate: a summarizer that paraphrases or invents a quote fails
 * it, and the whole draft is rejected in favour of the extractive summary.
 */
export function quoteIsGrounded(quote: string, sourceText: string): boolean {
  const needle = normalizeForMatch(quote);
  if (needle.length < MIN_QUOTE_CHARS) return false;
  return normalizeForMatch(sourceText).includes(needle);
}

/** The full grounding text for one source: its title and body. */
function groundingText(source: { title: string; content: string }): string {
  return `${source.title}\n${source.content}`;
}

/** A claim is grounded when it cites a known source and quotes that source verbatim. */
function claimIsGrounded(
  claim: BriefClaim,
  sourcesById: Map<number, BriefSource>,
): boolean {
  const source = sourcesById.get(claim.sourceId);
  if (!source) return false;
  return quoteIsGrounded(claim.quote, groundingText(source));
}

/**
 * A conflict is only surfaced when it names at least two *distinct* sources and every
 * side is grounded — otherwise it is noise, not a documented disagreement.
 */
function conflictIsGrounded(
  conflict: BriefConflict,
  sourcesById: Map<number, BriefSource>,
): boolean {
  if (conflict.sides.length < 2) return false;
  const distinctSources = new Set(conflict.sides.map((s) => s.sourceId));
  if (distinctSources.size < 2) return false;
  return conflict.sides.every((side) => claimIsGrounded(side, sourcesById));
}

/**
 * Every draft claim and conflict must be grounded, and the summary's inline citations
 * must resolve. This is why a live summary can be trusted despite being LLM-written.
 */
export function draftIsGrounded(
  draft: BriefDraft,
  sources: BriefSource[],
): boolean {
  if (!citationsAreValid(draft.summary, sources)) return false;
  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  if (!draft.claims.every((claim) => claimIsGrounded(claim, sourcesById))) return false;
  return draft.conflicts.every((conflict) => conflictIsGrounded(conflict, sourcesById));
}

/** First sentence (or a bounded prefix) of a source body, as a real verbatim quote. */
function leadingQuote(source: { title: string; content: string }, maxLen = 220): string {
  const body = source.content.replace(/\s+/g, ' ').trim() || source.title.trim();
  const sentenceEnd = body.search(/(?<=[.!?])\s/);
  const end = sentenceEnd > MIN_QUOTE_CHARS ? sentenceEnd + 1 : body.length;
  const quote = body.slice(0, Math.min(end, maxLen)).trim();
  return quote.length >= MIN_QUOTE_CHARS ? quote : body.slice(0, maxLen).trim();
}

/** The always-valid fallback: a grounded, cited summary stitched from the top signals. */
export function buildExtractiveSummary(items: BriefItem[]): string {
  if (items.length === 0) {
    return 'No insights yet. Run `npm run seed` (or ingest live sources) to populate the brief.';
  }

  const highImpact = items.filter((item) => item.impactScore >= 4).length;
  const lead =
    `${items.length} insight${items.length === 1 ? '' : 's'} in today's brief` +
    (highImpact > 0 ? `, ${highImpact} at impact 4 or higher.` : '.');

  const highlights = items
    .slice(0, 3)
    .map((item) => `${item.summary} [#${item.id}]`)
    .join(' ');

  return `${lead} ${highlights}`.trim();
}

/**
 * The deterministic, always-grounded claims behind the extractive summary: the top
 * signals' own conclusions, each quoted from the source body it was derived from.
 */
export function buildExtractiveClaims(
  items: BriefItem[],
  sourcesById: Map<number, BriefSource>,
): BriefClaim[] {
  return items.slice(0, 3).map((item) => {
    const source = sourcesById.get(item.id);
    return {
      text: item.summary,
      sourceId: item.id,
      quote: source ? leadingQuote(source) : item.summary,
    };
  });
}

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Structural conflicts read straight from the change history: an `update` event means a
 * later item revised a vendor's prior state on some dimension. When *both* the item that
 * carried the new state and the item behind the old state are in today's brief, that is a
 * documented disagreement between two visible sources — surfaced, not silently collapsed
 * to "the latest wins". Everything is quoted from the two items' own bodies, so the
 * conflict is grounded by construction and never invented.
 */
export function detectStructuralConflicts(
  db: Database,
  items: BriefItem[],
  sourcesById: Map<number, BriefSource>,
): BriefConflict[] {
  const itemIds = items.map((item) => item.id);
  if (itemIds.length === 0) return [];

  const events = db
    .select({
      vendor: changeEvents.vendor,
      dimension: changeEvents.dimension,
      before: changeEvents.before,
      after: changeEvents.after,
      triggerItemId: changeEvents.triggerItemId,
      previousFactId: changeEvents.previousFactId,
    })
    .from(changeEvents)
    .where(
      and(
        eq(changeEvents.kind, 'update'),
        eq(changeEvents.status, 'ok'),
        inArray(changeEvents.triggerItemId, itemIds),
      ),
    )
    .all();

  const conflicts: BriefConflict[] = [];
  for (const event of events) {
    if (event.previousFactId === null) continue;

    const priorFact = db
      .select({ evidenceItemId: vendorFacts.evidenceItemId })
      .from(vendorFacts)
      .where(eq(vendorFacts.id, event.previousFactId))
      .get();
    const priorItemId = priorFact?.evidenceItemId;
    if (priorItemId === undefined || priorItemId === event.triggerItemId) continue;

    const current = sourcesById.get(event.triggerItemId);
    const prior = sourcesById.get(priorItemId);
    if (!current || !prior) continue; // only surface conflicts both sides of which are visible

    conflicts.push({
      topic: `${event.vendor} — ${event.dimension}`,
      sides: [
        { text: event.after, sourceId: current.id, quote: leadingQuote(current) },
        { text: event.before ?? prior.summary, sourceId: prior.id, quote: leadingQuote(prior) },
      ],
      note: 'The record changed between these sources; both states are shown rather than assuming the newer one is settled.',
    });
  }

  return conflicts;
}

/** Load the raw bodies for the ranked items so quotes can be grounded against them. */
function loadSources(db: Database, items: BriefItem[]): BriefSource[] {
  if (items.length === 0) return [];
  const rows = db
    .select({ id: rawItems.id, content: rawItems.content })
    .from(rawItems)
    .where(inArray(rawItems.id, items.map((item) => item.id)))
    .all();
  const contentById = new Map(rows.map((row) => [row.id, row.content]));
  return items.map((item) => ({ ...item, content: contentById.get(item.id) ?? '' }));
}

/**
 * Verify each item's URL and stamp the verdict onto it. Runs in parallel; a verifier that
 * throws is treated as "unreachable" so one bad link never fails the whole brief.
 */
async function verifyUrls(items: BriefItem[], verifier: UrlVerifier): Promise<void> {
  await Promise.all(
    items.map(async (item) => {
      try {
        item.urlStatus = await verifier.verify(item);
      } catch {
        item.urlStatus = 'unreachable';
      }
    }),
  );
}

export interface ComposeBriefOptions {
  /** Calendar day the brief covers, `YYYY-MM-DD`; defaults to `now`'s date. */
  date?: string;
  /** Reference instant for recency + default date. */
  now?: Date;
  /** How many signals the brief carries. */
  topN?: number;
  /** Live summary writer; omit for the deterministic extractive summary (demo mode). */
  summarizer?: BriefSummarizer;
  /** Verify each item's URL before committing it as a source; omit to skip (demo mode). */
  verifier?: UrlVerifier;
}

/**
 * Compose (but do not persist) the brief for a date: rank the corpus, take the top-N,
 * verify their source links, and produce a citation-safe, quote-grounded executive
 * summary plus any surfaced conflicts. Persisting is `saveBrief`'s job so the composer
 * stays pure and testable.
 */
export async function composeBrief(
  db: Database,
  options: ComposeBriefOptions = {},
): Promise<ComposedBrief> {
  const now = options.now ?? new Date();
  const briefDate = options.date ?? isoDate(now);
  const items = rankSignals(db, { now, limit: options.topN ?? 8 }).map(toBriefItem);

  if (options.verifier && items.length > 0) {
    await verifyUrls(items, options.verifier);
  }

  const sources = loadSources(db, items);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const structuralConflicts = detectStructuralConflicts(db, items, sourcesById);

  if (options.summarizer && items.length > 0) {
    try {
      const draft = await options.summarizer.summarize(sources);
      if (draft.summary.trim() && draftIsGrounded(draft, sources)) {
        return {
          briefDate,
          summary: draft.summary.trim(),
          items,
          claims: draft.claims,
          conflicts: mergeConflicts(structuralConflicts, draft.conflicts),
          model: options.summarizer.model,
          promptVersion: options.summarizer.promptVersion,
        };
      }
    } catch {
      // Any summarizer failure falls through to the deterministic extractive summary.
    }
  }

  return {
    briefDate,
    summary: buildExtractiveSummary(items),
    items,
    claims: buildExtractiveClaims(items, sourcesById),
    conflicts: structuralConflicts,
    model: items.length > 0 ? EXTRACTIVE_MODEL : null,
    promptVersion: items.length > 0 ? BRIEF_PROMPT_VERSION : null,
  };
}

/** Union structural and drafted conflicts, keeping one entry per topic. */
function mergeConflicts(
  structural: BriefConflict[],
  drafted: BriefConflict[],
): BriefConflict[] {
  const byTopic = new Map<string, BriefConflict>();
  for (const conflict of [...structural, ...drafted]) {
    byTopic.set(conflict.topic.toLowerCase(), conflict);
  }
  return [...byTopic.values()];
}
