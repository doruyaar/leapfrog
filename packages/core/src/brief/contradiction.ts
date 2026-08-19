/**
 * Deterministic contradiction detection between two statements about the same subject.
 *
 * "Sources disagree" is an alarm, and alarms live or die on precision: a later post that
 * merely *refines* an earlier account (the common case for follow-ups and series posts)
 * must not trigger it. So instead of guessing from metadata (publisher, recency), this
 * module checks whether the two texts make **opposing claims**, using three concrete,
 * testable measures:
 *
 * 1. **Negation flip** — one side negates a content word the other asserts
 *    ("supports air-gapped deploys" vs "does not support air-gapped deploys").
 * 2. **Polarity opposition** — the sides use terms from opposite groups of the same
 *    axis ("raised pricing" vs "pricing was flat"; "launches" vs "discontinues").
 * 3. **Figure divergence** — both sides quote figures of the same kind (money,
 *    percentage, version) and none of the values match ("up 20%" vs "up 10%").
 *
 * A gate requires the statements to share enough content words to be about the same
 * thing at all; otherwise no measure fires. All of it is plain text analysis: zero keys,
 * deterministic, demo-safe.
 */

export interface ContradictionResult {
  contradicts: boolean;
  /** Human-readable evidence for each measure that fired, e.g. `"raised" vs "flat"`. */
  signals: string[];
}

/**
 * An optional live judge (LLM-backed) for the same question. Its verdict is preferred
 * when available because it understands paraphrase the lexical measures cannot — but its
 * output is validated before it is trusted (see `judge.ts`), and any failure falls back
 * to {@link detectContradiction} rather than shipping an unchecked verdict.
 */
export interface ContradictionJudge {
  readonly model: string;
  readonly promptVersion: string;
  judge(a: string, b: string): Promise<ContradictionResult>;
}

/**
 * Decide whether two statements contradict: the judge when one is configured (live
 * mode), the deterministic measures otherwise or whenever the judge fails — so the
 * decision is always available, keyless, and never an unvalidated LLM claim.
 */
export async function decideContradiction(
  a: string,
  b: string,
  judge?: ContradictionJudge,
): Promise<ContradictionResult> {
  if (judge) {
    try {
      return await judge.judge(a, b);
    } catch {
      // Unreachable model or ungrounded output — fall through to the measures.
    }
  }
  return detectContradiction(a, b);
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'over',
  'so',
  'than',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'was',
  'were',
  'while',
  'will',
  'with',
]);

const NEGATIONS = new Set([
  'not',
  'no',
  'never',
  'none',
  'cannot',
  'cant',
  'wont',
  'dont',
  'doesnt',
  'didnt',
  'isnt',
  'arent',
  'wasnt',
  'werent',
  'longer', // "no longer" — "no" also matches alone
]);

/**
 * Opposing term groups. Each axis lists mutually exclusive stances; a statement hitting
 * one group while the other statement hits a different group of the same axis is an
 * opposing claim. Word forms are listed explicitly — no fragile stemming of rare verbs.
 */
const POLARITY_AXES: { axis: string; groups: string[][] }[] = [
  {
    axis: 'direction',
    groups: [
      [
        'raise',
        'raised',
        'raises',
        'raising',
        'increase',
        'increased',
        'increases',
        'hike',
        'hiked',
        'hikes',
        'grew',
        'grow',
        'grows',
      ],
      [
        'lower',
        'lowered',
        'lowers',
        'cut',
        'cuts',
        'decrease',
        'decreased',
        'decreases',
        'drop',
        'dropped',
        'drops',
        'reduce',
        'reduced',
        'reduces',
      ],
      ['flat', 'unchanged', 'steady', 'stable'],
    ],
  },
  {
    axis: 'lifecycle',
    groups: [
      [
        'launch',
        'launched',
        'launches',
        'release',
        'released',
        'releases',
        'introduce',
        'introduced',
        'introduces',
        'ship',
        'shipped',
        'ships',
      ],
      [
        'discontinue',
        'discontinued',
        'discontinues',
        'sunset',
        'sunsets',
        'deprecate',
        'deprecated',
        'deprecates',
        'retire',
        'retired',
        'retires',
        'cancel',
        'cancelled',
        'canceled',
        'cancels',
        'kill',
        'kills',
        'killed',
      ],
    ],
  },
  {
    axis: 'stance',
    groups: [
      [
        'confirm',
        'confirmed',
        'confirms',
        'acknowledge',
        'acknowledged',
        'acknowledges',
        'admits',
        'admitted',
      ],
      [
        'deny',
        'denied',
        'denies',
        'dispute',
        'disputed',
        'disputes',
        'refute',
        'refuted',
        'refutes',
        'reject',
        'rejected',
        'rejects',
        'retract',
        'retracted',
        'retracts',
      ],
    ],
  },
  {
    axis: 'cost',
    groups: [['free'], ['paid', 'chargeable']],
  },
];

/** Lowercased word tokens; apostrophes collapse so "doesn't" becomes "doesnt". */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9%$.]+/)
    .map((token) => token.replace(/^[.$%]+|[.$%]+$/g, ''))
    .filter((token) => token.length > 0);
}

/** Fold trivial plurals so "supports" and "support" count as the same content word. */
function stem(token: string): string {
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function contentStems(tokens: string[]): Set<string> {
  const stems = new Set<string>();
  for (const token of tokens) {
    if (STOPWORDS.has(token) || NEGATIONS.has(token) || /^\d/.test(token)) continue;
    stems.add(stem(token));
  }
  return stems;
}

/** How many tokens back a negation still binds to a word ("does not currently support"). */
const NEGATION_WINDOW = 3;

/** Content stems that appear under a negation in the token stream. */
function negatedStems(tokens: string[]): Set<string> {
  const negated = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    if (!NEGATIONS.has(tokens[i]!)) continue;
    for (let j = i + 1; j <= Math.min(i + NEGATION_WINDOW, tokens.length - 1); j++) {
      const candidate = tokens[j]!;
      if (STOPWORDS.has(candidate) || NEGATIONS.has(candidate)) continue;
      negated.add(stem(candidate));
    }
  }
  return negated;
}

interface FigureMentions {
  money: Set<string>;
  percent: Set<string>;
  version: Set<string>;
}

function extractFigures(text: string): FigureMentions {
  const money = new Set<string>();
  for (const match of text.matchAll(/[$€£]\s?(\d[\d,]*(?:\.\d+)?)/g)) {
    money.add(match[1]!.replace(/,/g, ''));
  }
  const percent = new Set<string>();
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi)) {
    percent.add(match[1]!);
  }
  const version = new Set<string>();
  for (const match of text.matchAll(/(?<![$€£\d.])\bv?(\d+\.\d+(?:\.\d+)?)\b/g)) {
    version.add(match[1]!);
  }
  return { money, percent, version };
}

function disjoint(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const value of a) if (b.has(value)) return false;
  return true;
}

/** Which polarity group of each axis a statement's tokens land in (if exactly one). */
function polarityHits(stems: Set<string>): Map<string, { group: number; term: string }> {
  const hits = new Map<string, { group: number; term: string }>();
  for (const { axis, groups } of POLARITY_AXES) {
    let found: { group: number; term: string } | null = null;
    let ambiguous = false;
    for (let g = 0; g < groups.length; g++) {
      const term = groups[g]!.find((word) => stems.has(stem(word)));
      if (!term) continue;
      if (found && found.group !== g) ambiguous = true;
      found ??= { group: g, term };
    }
    // A statement hitting two opposing groups of one axis contradicts itself more than
    // the other statement; skip the axis rather than guess.
    if (found && !ambiguous) hits.set(axis, found);
  }
  return hits;
}

/** Minimum shared content words before two statements are considered comparable. */
const MIN_SHARED_CONTENT = 2;

/**
 * Do two statements about the same subject make opposing claims? Returns the concrete
 * evidence for every measure that fired, suitable for showing to the reader.
 */
export function detectContradiction(a: string, b: string): ContradictionResult {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const stemsA = contentStems(tokensA);
  const stemsB = contentStems(tokensB);

  const shared = [...stemsA].filter((s) => stemsB.has(s));
  if (shared.length < MIN_SHARED_CONTENT) return { contradicts: false, signals: [] };

  const signals: string[] = [];

  // 1. Negation flip on a shared content word.
  const negatedA = negatedStems(tokensA);
  const negatedB = negatedStems(tokensB);
  for (const word of shared) {
    if (negatedA.has(word) !== negatedB.has(word)) {
      signals.push(`one side negates "${word}"`);
      break;
    }
  }

  // 2. Opposing polarity terms on the same axis.
  const hitsA = polarityHits(stemsA);
  const hitsB = polarityHits(stemsB);
  for (const [axis, hitA] of hitsA) {
    const hitB = hitsB.get(axis);
    if (hitB && hitB.group !== hitA.group) {
      signals.push(`opposing terms: "${hitA.term}" vs "${hitB.term}"`);
    }
  }

  // 3. Figures of the same kind with no value in common.
  const figuresA = extractFigures(a);
  const figuresB = extractFigures(b);
  const kinds: [keyof FigureMentions, string][] = [
    ['money', 'amounts'],
    ['percent', 'percentages'],
    ['version', 'versions'],
  ];
  for (const [kind, label] of kinds) {
    if (disjoint(figuresA[kind], figuresB[kind])) {
      signals.push(
        `${label} differ: ${[...figuresA[kind]].join(', ')} vs ${[...figuresB[kind]].join(', ')}`,
      );
    }
  }

  return { contradicts: signals.length > 0, signals };
}
