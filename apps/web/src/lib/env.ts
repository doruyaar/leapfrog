import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadEnvConfig } from '@next/env';

/**
 * Load the monorepo-root `.env` into this server process.
 *
 * Next only auto-loads env files from the app directory (`apps/web`), but the monorepo
 * keeps a single root `.env` shared with the worker. Loading it in `next.config.ts`
 * does not reach the route-handler runtime under Turbopack (separate process), so this
 * module does it as an import side effect — it runs exactly where `process.env` is read.
 * Vars already present in the environment (e.g. injected in production) are preserved,
 * and when no workspace root exists (deployed standalone) this is a no-op.
 */

/** The nearest ancestor whose package.json declares `workspaces` (the monorepo root). */
function workspaceRoot(from: string): string | undefined {
  let dir = from;
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ('workspaces' in (JSON.parse(readFileSync(manifest, 'utf8')) as object)) {
          return dir;
        }
      } catch {
        // Unreadable manifest — keep walking up.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const root = workspaceRoot(process.cwd());
if (root) loadEnvConfig(root, process.env.NODE_ENV !== 'production');
