import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Nearest ancestor of `from` whose package.json declares workspaces (the repo root). */
function workspaceRoot(from: string): string | undefined {
  let dir = from;

  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ('workspaces' in JSON.parse(readFileSync(manifest, 'utf8'))) return dir;
      } catch {
        // A malformed manifest is not our problem to report; keep walking up.
      }
    }

    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Load the repo-root `.env` into `process.env` before any command runs.
 *
 * The worker is launched with `tsx` (not Next.js), so nothing loads `.env` for it
 * automatically — without this, live-mode keys like `OPENROUTER_API_KEY` sit unread.
 * Loading is best-effort and skipped when the file is absent, so demo mode still runs
 * with zero configuration. Values already present in the environment win, so an
 * explicit `KEY=… npm run …` override is never clobbered by the file.
 */
export function loadEnv(): void {
  const root = workspaceRoot(process.cwd()) ?? process.cwd();
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}
