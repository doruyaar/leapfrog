import '@/lib/env';
import { NextResponse } from 'next/server';
import {
  answerQuestion,
  createOpenRouterAnswerModel,
  type AnswerModel,
  type Category,
} from '@leapfrog/core';
import { getDb } from '@/lib/db';
import { allowRequest, clientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Upper bound on user-supplied text fields. Real questions are a sentence or two;
 * anything near this limit is either an accident or an attempt to run up token
 * spend (live mode) or embedding CPU (key-free mode).
 */
const MAX_FIELD_LENGTH = 2_000;

/** Use the live chat model only when a key is configured; otherwise stay extractive. */
function optionalModel(): AnswerModel | undefined {
  try {
    return process.env.OPENROUTER_API_KEY?.trim()
      ? createOpenRouterAnswerModel()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request))) {
    return NextResponse.json(
      { error: 'rate limit exceeded — try again in a minute' },
      { status: 429 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({
      answer: 'No data loaded yet. Run `npm run seed`, then ask again.',
      citations: [],
      mode: 'refusal',
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    question?: unknown;
    vendor?: unknown;
    category?: unknown;
    context?: { label?: unknown; preamble?: unknown; focusId?: unknown } | null;
  };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }
  if (question.length > MAX_FIELD_LENGTH) {
    return NextResponse.json(
      { error: `question is too long (max ${MAX_FIELD_LENGTH} characters)` },
      { status: 400 },
    );
  }

  // The "Talk about it" subject, if the drawer was opened from a page. Both text fields
  // must be present, otherwise we treat the question as unscoped.
  const rawContext = body.context;
  const context =
    rawContext &&
    typeof rawContext.label === 'string' &&
    typeof rawContext.preamble === 'string' &&
    rawContext.label.trim() &&
    rawContext.preamble.trim()
      ? {
          label: rawContext.label.trim(),
          preamble: rawContext.preamble.trim(),
          focusId:
            typeof rawContext.focusId === 'number' &&
            Number.isInteger(rawContext.focusId) &&
            rawContext.focusId > 0
              ? rawContext.focusId
              : undefined,
        }
      : undefined;
  if (
    context &&
    (context.label.length > MAX_FIELD_LENGTH ||
      context.preamble.length > MAX_FIELD_LENGTH)
  ) {
    return NextResponse.json(
      { error: `context fields are too long (max ${MAX_FIELD_LENGTH} characters)` },
      { status: 400 },
    );
  }

  const result = await answerQuestion(db, question, {
    vendor: typeof body.vendor === 'string' ? body.vendor : undefined,
    category: typeof body.category === 'string' ? (body.category as Category) : undefined,
    context,
    model: optionalModel(),
  });

  return NextResponse.json(result);
}
