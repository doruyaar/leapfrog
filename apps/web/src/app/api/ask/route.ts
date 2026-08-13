import { NextResponse } from 'next/server';
import {
  answerQuestion,
  createOpenRouterAnswerModel,
  type AnswerModel,
  type Category,
} from '@leapfrog/core';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
  };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const result = await answerQuestion(db, question, {
    vendor: typeof body.vendor === 'string' ? body.vendor : undefined,
    category: typeof body.category === 'string' ? (body.category as Category) : undefined,
    model: optionalModel(),
  });

  return NextResponse.json(result);
}
