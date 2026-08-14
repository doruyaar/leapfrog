/**
 * `worker eval` — run the golden datasets against the deterministic pipeline logic
 * (GAP-PLAN §3.4). Today that is change classification: the labeled pairs in
 * `data/eval/change-pairs.json` are scored with the same local embeddings and the
 * same threshold the diff stage uses, so a threshold or model change that would
 * flip a known verdict fails loudly before it ships. Key-free by construction.
 */
import {
  createLocalEmbedder,
  evaluateChangePairs,
  readChangePairs,
  readSimilarityThreshold,
  type ChangeEvalReport,
} from '@leapfrog/core';
import { parseFlags } from '../args.js';

export interface EvalCommandOptions {
  json: boolean;
}

export function parseEvalArgs(argv: string[]): EvalCommandOptions {
  const flags = parseFlags(argv, { switches: ['json'] });
  return { json: flags.json === true };
}

function printReport(report: ChangeEvalReport, threshold: number): void {
  for (const result of report.results) {
    const mark = result.correct ? '✓' : '✗';
    const sim = result.similarity === null ? '' : ` (sim ${result.similarity.toFixed(3)})`;
    console.log(
      `${mark} ${result.id}: expected ${result.expected}, got ${result.actual}${sim}`,
    );
  }
  console.log(
    `\nchange classification: ${report.correct}/${report.total} ` +
      `(${(report.accuracy * 100).toFixed(0)}%) at threshold ${threshold}`,
  );
}

export async function runEvalCommand(argv: string[]): Promise<number> {
  const options = parseEvalArgs(argv);
  const threshold = readSimilarityThreshold();
  const pairs = readChangePairs();

  if (!options.json) {
    console.log(
      `Evaluating ${pairs.length} golden change pairs (local embeddings, no key)…\n`,
    );
  }

  const report = await evaluateChangePairs(createLocalEmbedder(), pairs, threshold);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, threshold);
  }

  return report.correct === report.total ? 0 : 1;
}
