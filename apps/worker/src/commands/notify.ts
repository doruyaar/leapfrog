/**
 * `worker notify` — the delivery pass (docs/DESIGN.md §5, step 6, generalised from Slack
 * to email subscriptions). Evaluate every enabled subscription against the corpus and
 * email the new matches. Real delivery needs `RESEND_API_KEY`; without it the command runs
 * in demo mode and sends nothing (preview how alerts look in the app at `/notifications`).
 * Safe to re-run — the delivery ledger means a second run sends nothing new.
 */
import {
  createDatabase,
  resolveDatabasePath,
  runMigrations,
  runNotifications,
  sendTestNotification,
  type NotifyRunResult,
  type TestSendResult,
} from '@leapfrog/core';
import { numberFlag, parseFlags, stringFlag } from '../args.js';

export interface NotifyCommandOptions {
  dbPath?: string;
  baseUrl?: string;
  /** When set, send a one-off test to this subscription id instead of a full run. */
  testId?: number;
  json: boolean;
}

export function parseNotifyArgs(argv: string[]): NotifyCommandOptions {
  const flags = parseFlags(argv, {
    values: ['db', 'base-url', 'test'],
    switches: ['json'],
  });

  return {
    dbPath: stringFlag(flags, 'db'),
    baseUrl: stringFlag(flags, 'base-url'),
    testId: numberFlag(flags, 'test', { min: 1 }),
    json: flags.json === true,
  };
}

function printRun(result: NotifyRunResult): void {
  console.log(
    `\nChannel: ${result.channel} — ${result.delivered} email(s), ${result.sent} insight(s) delivered\n`,
  );
  for (const r of result.results) {
    if (r.delivered) {
      const where = r.ref ? ` → ${r.ref}` : '';
      console.log(`  ✓ ${r.email} · ${r.label} — ${r.matched} insight(s)${where}`);
    } else if (r.matched === 0) {
      console.log(`  • ${r.email} · ${r.label} — no new matches`);
    } else {
      console.log(`  ✗ ${r.email} · ${r.label} — not sent (${r.reason})`);
    }
  }
  if (result.channel === 'preview') {
    console.log('\nDemo mode: email delivery is off, so nothing was sent.');
    console.log('Preview how each alert looks in the app at /notifications.');
    console.log('Set RESEND_API_KEY to deliver to a real inbox instead.');
  }
}

function printTest(result: TestSendResult): void {
  const tag = result.sample ? ' (sample — nothing matches yet)' : '';
  if (result.delivered) {
    const where = result.ref ? ` → ${result.ref}` : '';
    console.log(`✓ Test sent to ${result.email}${tag}${where}`);
  } else {
    console.log(`✗ Test not sent to ${result.email} — ${result.reason}`);
  }
}

export async function runNotifyCommand(argv: string[]): Promise<number> {
  const options = parseNotifyArgs(argv);
  const db = createDatabase({ path: options.dbPath });
  runMigrations(db);

  const verbose = !options.json;
  if (verbose) {
    console.log(`Delivering notifications from ${resolveDatabasePath(options.dbPath)}…`);
  }

  try {
    if (options.testId !== undefined) {
      const test = await sendTestNotification(db, options.testId, {
        baseUrl: options.baseUrl,
      });
      if (!test) {
        console.error(`no subscription with id ${options.testId}`);
        return 1;
      }
      if (options.json) console.log(JSON.stringify(test, null, 2));
      else printTest(test);
      return test.delivered ? 0 : 1;
    }

    const result = await runNotifications(db, { baseUrl: options.baseUrl });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printRun(result);
    return 0;
  } finally {
    db.$client.close();
  }
}
