/**
 * Battlecards (build-plan issue 15): a sales-enablement view of "us vs. one competitor",
 * composed from two grounded sources — the curated {@link ComparisonMatrix} (where each
 * side is strong) and the live corpus (what the competitor has actually been doing).
 *
 * Like the brief, the card is always producible and never ungrounded: the positioning
 * line cites real signal ids, an optional {@link BattlecardSummarizer} is citation-checked
 * with a deterministic extractive fallback, and the whole card exports to Markdown so it
 * can leave the app for a CRM or a deck.
 */
import type { Category } from '../db/schema.js';
import type { Database } from '../db/client.js';
import { readSignals } from '../query/signals.js';
import { signalScore } from '../brief/rank.js';
import { extractCitations } from '../brief/compose.js';
import { readComparisonMatrix, type ComparisonMatrix } from '../matrix/matrix.js';

/** Bump when the extractive positioning wording or the card contract changes. */
export const BATTLECARD_PROMPT_VERSION = 'battlecard@1';
export const EXTRACTIVE_MODEL = 'extractive';

/** One axis where one side out-covers the other, with both sides' curated notes. */
export interface BattlecardEdge {
  axisId: string;
  axisLabel: string;
  ourNote: string;
  theirNote: string;
}

/** A corpus signal referenced on the card. */
export interface BattlecardSignalRef {
  id: number;
  title: string;
  category: Category;
  impactScore: number;
  publishedAt: string | null;
  summary: string;
}

export interface Battlecard {
  vendor: string;
  focusVendor: string;
  generatedAt: string;
  /** Citation-safe positioning line (`[#id]` references resolve to `sources`). */
  summary: string;
  /** Axes where the focus vendor leads. */
  ourStrengths: BattlecardEdge[];
  /** Axes where the competitor leads. */
  theirStrengths: BattlecardEdge[];
  /** Axes where both are strong — expect objections, don't lean here. */
  parity: BattlecardEdge[];
  recentSignals: BattlecardSignalRef[];
  talkingPoints: string[];
  sources: Array<{ id: number; title: string; url: string }>;
  model: string | null;
  promptVersion: string | null;
}

/** Optional live writer for the positioning line; always citation-validated by the composer. */
export interface BattlecardSummarizer {
  readonly model: string;
  readonly promptVersion: string;
  summarize(
    card: Omit<Battlecard, 'summary' | 'model' | 'promptVersion'>,
  ): Promise<string>;
}

export interface ComposeBattlecardOptions {
  matrix?: ComparisonMatrix;
  now?: Date;
  /** How many recent signals to carry. */
  maxSignals?: number;
  summarizer?: BattlecardSummarizer;
}

/** The always-valid fallback positioning line, grounded in the matrix and top signal. */
export function buildExtractiveSummary(
  card: Pick<
    Battlecard,
    | 'vendor'
    | 'focusVendor'
    | 'ourStrengths'
    | 'theirStrengths'
    | 'parity'
    | 'recentSignals'
  >,
): string {
  const { focusVendor, vendor, ourStrengths, theirStrengths, parity, recentSignals } =
    card;
  const latestMove = recentSignals[0]
    ? ` Latest tracked move: ${recentSignals[0].summary} [#${recentSignals[0].id}]`
    : '';

  // A competitor with no curated matrix coverage (not on the grid yet): position from the
  // live corpus alone rather than inventing a matrix comparison we do not hold.
  if (ourStrengths.length + theirStrengths.length + parity.length === 0) {
    const n = recentSignals.length;
    const basis =
      n === 0
        ? `no tracked signals for ${vendor} yet`
        : `${n} tracked ${n === 1 ? 'signal' : 'signals'}`;
    return `${vendor} isn't on the ${focusVendor} comparison matrix yet — positioning here is based on ${basis}.${latestMove}`.trim();
  }

  const lead =
    `Against ${vendor}, ${focusVendor} leads on ${ourStrengths.length} ` +
    `axis${ourStrengths.length === 1 ? '' : 'es'}` +
    (ourStrengths.length
      ? ` (${ourStrengths
          .slice(0, 3)
          .map((e) => e.axisLabel)
          .join(', ')})`
      : '') +
    '.';
  const theirs = theirStrengths.length
    ? ` ${vendor} is strongest on ${theirStrengths
        .slice(0, 3)
        .map((e) => e.axisLabel)
        .join(', ')}.`
    : ` ${vendor} shows no clearly differentiated axis in our matrix.`;
  return `${lead}${theirs}${latestMove}`.trim();
}

function buildTalkingPoints(card: {
  vendor: string;
  focusVendor: string;
  ourStrengths: BattlecardEdge[];
  theirStrengths: BattlecardEdge[];
  recentSignals: BattlecardSignalRef[];
}): string[] {
  const points: string[] = [];
  if (card.ourStrengths.length) {
    points.push(
      `Lead with ${card.focusVendor}'s edge on ${card.ourStrengths
        .slice(0, 2)
        .map((e) => e.axisLabel)
        .join(' and ')}.`,
    );
  }
  if (card.theirStrengths.length) {
    points.push(
      `Prepare to counter ${card.vendor} on ${card.theirStrengths
        .slice(0, 2)
        .map((e) => e.axisLabel)
        .join(' and ')}.`,
    );
  }
  if (card.recentSignals[0]) {
    points.push(
      `Reference recent movement: "${card.recentSignals[0].title}" [#${card.recentSignals[0].id}].`,
    );
  }
  return points;
}

/**
 * Compose (but do not persist) a battlecard for `vendor`. Any tracked competitor can get
 * a card: a matrix column contributes the head-to-head axis edges, and a competitor not
 * (yet) on the matrix still gets a corpus-only card from its recent signals. Returns
 * `null` only for the focus vendor itself or a vendor we have neither a matrix column nor
 * any tracked signal for. Re-running recomputes from the current corpus — the "refresh".
 */
export async function composeBattlecard(
  db: Database,
  vendor: string,
  options: ComposeBattlecardOptions = {},
): Promise<Battlecard | null> {
  const matrix = options.matrix ?? readComparisonMatrix();
  const focusVendor = matrix.focusVendor;

  const column = matrix.vendors.find(
    (v) => v.name.toLowerCase() === vendor.toLowerCase(),
  );
  // Prefer the matrix's canonical spelling; fall back to the caller's vendor name for
  // competitors that are tracked in the corpus but not on the curated grid.
  const target = column?.name ?? vendor;
  if (target.toLowerCase() === focusVendor.toLowerCase()) return null;

  const ourStrengths: BattlecardEdge[] = [];
  const theirStrengths: BattlecardEdge[] = [];
  const parity: BattlecardEdge[] = [];

  for (const axis of matrix.axes) {
    const ours = axis.cells[focusVendor];
    const theirs = axis.cells[target];
    if (!ours || !theirs) continue;
    const edge: BattlecardEdge = {
      axisId: axis.id,
      axisLabel: axis.label,
      ourNote: ours.note,
      theirNote: theirs.note,
    };
    const weak = ours.level === 'partial' || ours.level === 'none';
    const theirsWeak = theirs.level === 'partial' || theirs.level === 'none';
    if (ours.level === 'strong' && theirsWeak) ourStrengths.push(edge);
    else if (theirs.level === 'strong' && (weak || ours.level === 'info'))
      theirStrengths.push(edge);
    else if (ours.level === 'strong' && theirs.level === 'strong') parity.push(edge);
  }

  const now = options.now ?? new Date();
  const ranked = readSignals(db, { vendor: target })
    .map((signal) => ({
      signal,
      score: signalScore(signal.impactScore, signal.publishedAt, now),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxSignals ?? 5)
    .map(({ signal }) => signal);

  // A vendor that is neither on the matrix nor anywhere in the corpus has nothing to
  // stand on — treat it as unknown rather than emitting an empty card.
  if (!column && ranked.length === 0) return null;

  const recentSignals: BattlecardSignalRef[] = ranked.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    impactScore: s.impactScore,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
    summary: s.summary,
  }));
  const sources = ranked.map((s) => ({ id: s.id, title: s.title, url: s.url }));

  const base = {
    vendor: target,
    focusVendor,
    generatedAt: now.toISOString(),
    ourStrengths,
    theirStrengths,
    parity,
    recentSignals,
    talkingPoints: buildTalkingPoints({
      vendor: target,
      focusVendor,
      ourStrengths,
      theirStrengths,
      recentSignals,
    }),
    sources,
  };

  // sources double as the "items" a citation may reference.
  const citableIds = new Set(sources.map((s) => s.id));
  const citationsResolve = (text: string): boolean =>
    extractCitations(text).every((id) => citableIds.has(id));

  if (options.summarizer) {
    try {
      const written = await options.summarizer.summarize(base);
      if (written.trim() && citationsResolve(written)) {
        return {
          ...base,
          summary: written.trim(),
          model: options.summarizer.model,
          promptVersion: options.summarizer.promptVersion,
        };
      }
    } catch {
      // Fall through to the deterministic extractive summary.
    }
  }

  return {
    ...base,
    summary: buildExtractiveSummary(base),
    model: EXTRACTIVE_MODEL,
    promptVersion: BATTLECARD_PROMPT_VERSION,
  };
}

/** Strip `[#id]` citation tags — Markdown export inlines sources as a list instead. */
function stripCitations(text: string): string {
  return text.replace(/\s*\[#\d+\]/g, '').trim();
}

/** Render a battlecard as portable Markdown for export to a CRM, doc, or deck. */
export function toMarkdown(card: Battlecard): string {
  const lines: string[] = [];
  lines.push(`# Battlecard — ${card.focusVendor} vs. ${card.vendor}`);
  lines.push('');
  lines.push(`_Generated ${card.generatedAt.slice(0, 10)} from tracked signals._`);
  lines.push('');
  lines.push('## Positioning');
  lines.push(stripCitations(card.summary));
  lines.push('');

  lines.push(`## Where ${card.focusVendor} wins`);
  if (card.ourStrengths.length) {
    for (const edge of card.ourStrengths) {
      lines.push(`- **${edge.axisLabel}** — ${edge.ourNote} _(vs. ${edge.theirNote})_`);
    }
  } else {
    lines.push('- No differentiated advantage in the current matrix.');
  }
  lines.push('');

  lines.push(`## Watch-outs (${card.vendor} strengths)`);
  if (card.theirStrengths.length) {
    for (const edge of card.theirStrengths) {
      lines.push(`- **${edge.axisLabel}** — ${edge.theirNote}`);
    }
  } else {
    lines.push('- None flagged in the current matrix.');
  }
  lines.push('');

  if (card.talkingPoints.length) {
    lines.push('## Talking points');
    for (const point of card.talkingPoints) lines.push(`- ${stripCitations(point)}`);
    lines.push('');
  }

  lines.push('## Recent activity');
  if (card.recentSignals.length) {
    for (const signal of card.recentSignals) {
      const date = signal.publishedAt ? ` (${signal.publishedAt.slice(0, 10)})` : '';
      lines.push(`- **${signal.title}**${date} — ${signal.summary} [#${signal.id}]`);
    }
  } else {
    lines.push('- No tracked signals yet.');
  }
  lines.push('');

  if (card.sources.length) {
    lines.push('## Sources');
    for (const source of card.sources) {
      lines.push(`- [#${source.id}] [${source.title}](${source.url})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
