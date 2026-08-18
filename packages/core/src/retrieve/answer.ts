/**
 * Turning retrieved passages into a grounded, cited answer (docs/DESIGN.md §4).
 *
 * The whole point of the product is trust, so this stage refuses rather than guesses:
 * with no relevant passages it returns an explicit "not in my sources" answer. When it
 * can answer, every claim cites a source item (`[#<id>]`). In demo mode the answer is
 * composed extractively from the passages' own grounded summaries — no key, fully
 * offline. A live {@link AnswerModel} may write a fluent answer instead, but its
 * citations are validated against the retrieved set and a hallucinated citation falls
 * back to the extractive answer.
 */
import type { Database } from '../db/client.js';
import { extractCitations } from '../brief/compose.js';
import {
  hydratePassages,
  retrieve,
  type RetrieveOptions,
  type RetrievedPassage,
} from './hybrid.js';

/** Bump when the answer wording / grounding contract in `prompts/ask.md` changes. */
export const ASK_PROMPT_VERSION = 'ask@4';

/** Shown when the corpus has nothing relevant — the groundedness demo moment. */
export const REFUSAL_MESSAGE =
  "I don't have anything in my sources about that. LeapFrog only answers from its " +
  'tracked competitive-intelligence corpus — try a question about JFrog or a tracked ' +
  'competitor (Sonatype, GitLab, Docker, GitHub, Snyk, Chainguard, and others).';

/**
 * Warm reply to a greeting or small talk. Groundedness only bites on *claims*, so a
 * "hey" or "thanks" should be met like an assistant, not with the "not in my sources"
 * refusal. It still steers the user back to what LeapFrog can actually answer.
 */
export const GREETING_MESSAGE =
  "Hi — I'm LeapFrog, your competitive-intelligence assistant for the software-" +
  'supply-chain and artifact-management market. Ask me about JFrog or a tracked ' +
  'competitor (Sonatype, GitLab, Docker, GitHub, Snyk, Chainguard, and others) — a ' +
  'recent launch, CVE, pricing move, or how the competitive picture is shifting — and ' +
  "I'll answer from tracked sources, with citations.";

/**
 * Pure greetings / social niceties that carry no question to ground. Matched against the
 * whole message (punctuation and letter-elongation stripped) so a real question that
 * merely *opens* with a greeting — "hey, what's the latest on Sonatype?" — still goes
 * through retrieval and is answered or refused on its merits.
 */
const SMALL_TALK_PATTERNS: RegExp[] = [
  /^(hi+|hey+|hello+|helo+|hiya+|heya+|yo+|sup+|howdy+|hola+|greetings|gday)( (there|leapfrog|friend|team|all|everyone|folks))?$/,
  /^good (morning|afternoon|evening|day)( leapfrog| there| all| everyone)?$/,
  /^(how are you( doing| today)?|hows it going|how is it going|whats up|wassup|whats new|how goes it)$/,
  /^(thanks|thank you|thank u|thankyou|thx|ty|cheers|much appreciated|appreciate it|nice one)( leapfrog)?$/,
  /^(cool|nice|great|awesome|amazing|perfect|ok|okay|kk|got it|gotcha|sounds good|fair enough|makes sense|great stuff)$/,
  /^(who are you|what are you|what can you do|what do you do|what is this|whats this|how does this work|how do you work|what can you help( me)?( with)?|can you help|help)$/,
];

/**
 * True when the message is just a greeting / social nicety, not a question to ground.
 * Normalises case, drops punctuation and emoji, and collapses whitespace before matching
 * a small, closed set of phrases (with letter-elongation tolerated inside the patterns,
 * so "heyyy" still counts). Real questions that merely *open* with a greeting fall
 * through to retrieval, because the whole message must match a pattern.
 */
export function isSmallTalk(query: string): boolean {
  const normalized = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  return SMALL_TALK_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface Citation {
  id: number;
  title: string;
  url: string;
  vendor: string | null;
  category: string;
  impactScore: number;
}

export interface AskAnswer {
  answer: string;
  citations: Citation[];
  mode: 'refusal' | 'extractive' | 'llm' | 'greeting';
}

/**
 * The subject the user clicked "Talk about it" on. It scopes the conversation: the label
 * biases retrieval toward that signal, and the preamble tells a live model what "it" is.
 * It never adds ungrounded facts — every answer still cites retrieved passages.
 */
export interface AskContext {
  /** Human-readable subject, e.g. the insight title. Used to bias retrieval. */
  label: string;
  /** One-line note handed to the model: what the user is talking about. */
  preamble: string;
  /**
   * The signal id the user clicked "Talk about it" on. It is pinned as a guaranteed
   * passage so the subject is always answerable, even for a vague question like "what is
   * it?" that shares no terms with the body.
   */
  focusId?: number;
}

/** A live answer writer (OpenRouter chat, or a test stub). */
export interface AnswerModel {
  readonly model: string;
  readonly promptVersion: string;
  answer(
    query: string,
    passages: RetrievedPassage[],
    context?: AskContext,
  ): Promise<string>;
}

function toCitation(passage: RetrievedPassage): Citation {
  return {
    id: passage.rawItemId,
    title: passage.title,
    url: passage.url,
    vendor: passage.vendor,
    category: passage.category,
    impactScore: passage.impactScore,
  };
}

/** True when every `[#id]` in `text` refers to a retrieved passage. */
function citationsGrounded(text: string, passages: RetrievedPassage[]): boolean {
  const allowed = new Set(passages.map((p) => p.rawItemId));
  const cited = extractCitations(text);
  return cited.length > 0 && cited.every((id) => allowed.has(id));
}

/**
 * The refusal sentence `prompts/ask.md` instructs the model to reply with. It carries
 * no citations by design, so it must be recognised *before* the grounding check —
 * otherwise the (correct) refusal fails `citationsGrounded` and gets overridden by a
 * forced extractive answer, silently un-refusing the question.
 */
const MODEL_REFUSAL_SENTINEL = /i don[’']?t have anything in my sources/i;

/** True when the model reply is its instructed refusal (and cites nothing). */
function isModelRefusal(text: string): boolean {
  return MODEL_REFUSAL_SENTINEL.test(text) && extractCitations(text).length === 0;
}

/** First sentence (or a trimmed lead) of a passage, for a short verbatim quote. */
function leadQuote(content: string, max = 180): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  const stop = clean.search(/[.!?]\s/);
  const end = stop >= 40 ? stop + 1 : Math.min(clean.length, max);
  return clean.slice(0, end).trim();
}

/**
 * The always-available fallback (demo mode, no key). Every claim is a source summary
 * backed by a short verbatim quote and its citation, so the offline answer stays
 * evidence-first and auditable.
 *
 * With a `focus` (the signal the user clicked "Talk about it" on) the answer is composed
 * from that one signal, with the other retrieved signals listed compactly as related
 * citations. This is deliberate: the corpus holds tracked competitive-intelligence
 * signals, not general definitions, so a scoped question is answered from the tracked
 * signal itself rather than by stitching together loosely-related passages.
 */
export function buildExtractiveAnswer(
  passages: RetrievedPassage[],
  focus?: RetrievedPassage,
): string {
  if (focus) {
    const related = passages
      .filter((p) => p.rawItemId !== focus.rawItemId)
      .slice(0, 4)
      .map((p) => `[#${p.rawItemId}]`);
    const relatedNote = related.length
      ? ` Related tracked signals: ${related.join(' ')}.`
      : '';
    return (
      `Here's what the tracked signal reports: ${focus.summary} ` +
      `“${leadQuote(focus.content)}” [#${focus.rawItemId}].${relatedNote}`
    );
  }

  const lead = 'From the tracked sources:';
  const body = passages
    .slice(0, 3)
    .map((p) => `${p.summary} “${leadQuote(p.content)}” [#${p.rawItemId}]`)
    .join(' ');
  return `${lead} ${body}`;
}

export interface AskOptions extends RetrieveOptions {
  /** Live answer writer; omit for the deterministic extractive answer (demo mode). */
  model?: AnswerModel;
  /** Subject the user is "talking about"; scopes retrieval and the model preamble. */
  context?: AskContext;
}

/**
 * Answer a question against the corpus: retrieve, then compose a grounded answer or
 * refuse. Citations always resolve to real signals. When a {@link AskContext} is set the
 * subject label is folded into the retrieval query so the discussed signal is in scope,
 * but grounding and refusal are unchanged — an off-topic question still finds nothing.
 */
export async function answerQuestion(
  db: Database,
  query: string,
  options: AskOptions = {},
): Promise<AskAnswer> {
  // Greet, don't refuse: a bare "hey" / "thanks" carries no claim to ground, so meet it
  // like an assistant instead of the "not in my sources" wall. Real questions (even ones
  // that open with a greeting) fall through to retrieval and are answered or refused.
  if (isSmallTalk(query)) {
    return { answer: GREETING_MESSAGE, citations: [], mode: 'greeting' };
  }

  // Bias retrieval toward the discussed subject without letting it drown the question.
  const retrievalQuery = options.context ? `${query}\n${options.context.label}` : query;
  const retrieved = await retrieve(db, retrievalQuery, options);

  // Pin the clicked signal so it is always in scope (it may not match the query at all),
  // then append the query-retrieved passages, de-duplicated, pinned-first.
  const pinned = options.context?.focusId
    ? hydratePassages(db, [options.context.focusId])
    : [];
  const pinnedIds = new Set(pinned.map((p) => p.rawItemId));
  const passages = [...pinned, ...retrieved.filter((p) => !pinnedIds.has(p.rawItemId))];

  if (passages.length === 0) {
    return { answer: REFUSAL_MESSAGE, citations: [], mode: 'refusal' };
  }

  const citations = passages.map(toCitation);
  // The pinned subject, if any, leads the deterministic answer.
  const focus = pinned[0];

  if (options.model) {
    try {
      const written = (
        await options.model.answer(query, passages, options.context)
      ).trim();
      // An instructed refusal is a valid outcome, not a grounding failure — honour it
      // instead of overriding it with a forced extractive answer.
      if (isModelRefusal(written)) {
        return { answer: REFUSAL_MESSAGE, citations: [], mode: 'refusal' };
      }
      if (written && citationsGrounded(written, passages)) {
        return { answer: written, citations, mode: 'llm' };
      }
    } catch {
      // Fall through to the deterministic extractive answer.
    }
  }

  return {
    answer: buildExtractiveAnswer(passages, focus),
    citations,
    mode: 'extractive',
  };
}
