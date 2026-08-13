/**
 * `worker ask` — query the corpus with hybrid RAG (docs/DESIGN.md §4). Retrieves with
 * FTS5 + vectors fused by RRF, then answers with grounded citations or an explicit
 * refusal. No API key needed: the answer is composed extractively from the retrieved
 * signals. Set `OPENROUTER_API_KEY` to let a chat model write the answer instead (its
 * citations are still validated). Handy for exercising Ask without the browser.
 */
import {
  answerQuestion,
  createDatabase,
  createOpenRouterAnswerModel,
  runMigrations,
  type AnswerModel,
  type Category,
} from '@leapfrog/core';
import { parseFlags, stringFlag } from '../args.js';

export interface AskCommandOptions {
  question: string;
  vendor?: string;
  category?: string;
  dbPath?: string;
  json: boolean;
}

export function parseAskArgs(argv: string[]): AskCommandOptions {
  const flags = parseFlags(argv, {
    values: ['q', 'vendor', 'category', 'db'],
    switches: ['json'],
  });

  const question = stringFlag(flags, 'q');
  if (!question) throw new Error('ask needs a question: --q "…"');

  return {
    question,
    vendor: stringFlag(flags, 'vendor'),
    category: stringFlag(flags, 'category'),
    dbPath: stringFlag(flags, 'db'),
    json: flags.json === true,
  };
}

/** Use the live chat model only if a key is configured; otherwise stay extractive. */
function optionalAnswerModel(): AnswerModel | undefined {
  try {
    return process.env.OPENROUTER_API_KEY?.trim()
      ? createOpenRouterAnswerModel()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function runAskCommand(argv: string[]): Promise<number> {
  const options = parseAskArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  try {
    const result = await answerQuestion(db, options.question, {
      vendor: options.vendor,
      category: options.category as Category | undefined,
      model: optionalAnswerModel(),
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    console.log(`\nQ: ${options.question}\n`);
    console.log(`[${result.mode}] ${result.answer}\n`);
    if (result.citations.length > 0) {
      console.log('Sources:');
      for (const c of result.citations) {
        console.log(`  #${c.id} [${c.impactScore}] ${c.vendor ?? 'Market'} — ${c.title}`);
      }
    }
    return 0;
  } finally {
    db.$client.close();
  }
}
