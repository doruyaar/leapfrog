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
import { retrieve, type RetrieveOptions, type RetrievedPassage } from './hybrid.js';

/** Bump when the answer wording / grounding contract in `prompts/ask.md` changes. */
export const ASK_PROMPT_VERSION = 'ask@1';

/** Shown when the corpus has nothing relevant — the groundedness demo moment. */
export const REFUSAL_MESSAGE =
  "I don't have anything in my sources about that. LeapFrog only answers from its " +
  'tracked competitive-intelligence corpus — try a question about JFrog or a tracked ' +
  'competitor (Sonatype, GitLab, Docker, GitHub, Snyk, Chainguard, and others).';

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
  mode: 'refusal' | 'extractive' | 'llm';
}

/** A live answer writer (OpenRouter chat, or a test stub). */
export interface AnswerModel {
  readonly model: string;
  readonly promptVersion: string;
  answer(query: string, passages: RetrievedPassage[]): Promise<string>;
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

/** The always-available fallback: stitch the top passages' summaries with citations. */
export function buildExtractiveAnswer(passages: RetrievedPassage[]): string {
  const lead = 'From the tracked sources:';
  const body = passages
    .slice(0, 3)
    .map((p) => `${p.summary} [#${p.rawItemId}]`)
    .join(' ');
  return `${lead} ${body}`;
}

export interface AskOptions extends RetrieveOptions {
  /** Live answer writer; omit for the deterministic extractive answer (demo mode). */
  model?: AnswerModel;
}

/**
 * Answer a question against the corpus: retrieve, then compose a grounded answer or
 * refuse. Citations always resolve to real signals.
 */
export async function answerQuestion(
  db: Database,
  query: string,
  options: AskOptions = {},
): Promise<AskAnswer> {
  const passages = await retrieve(db, query, options);
  if (passages.length === 0) {
    return { answer: REFUSAL_MESSAGE, citations: [], mode: 'refusal' };
  }

  const citations = passages.map(toCitation);

  if (options.model) {
    try {
      const written = await options.model.answer(query, passages);
      if (written.trim() && citationsGrounded(written, passages)) {
        return { answer: written.trim(), citations, mode: 'llm' };
      }
    } catch {
      // Fall through to the deterministic extractive answer.
    }
  }

  return { answer: buildExtractiveAnswer(passages), citations, mode: 'extractive' };
}
