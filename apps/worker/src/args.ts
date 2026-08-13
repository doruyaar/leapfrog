/**
 * A `--flag value` / `--switch` parser for the worker commands.
 *
 * The worker gains a command per pipeline stage, and every one of them needs the
 * same handful of options parsed the same way — including rejecting a typo instead of
 * quietly ignoring it, which is how a filtered run gets mistaken for a full one.
 */

export interface FlagSpec {
  /** Options that take a value: `--kind rss`. */
  values?: readonly string[];
  /** Options that stand alone: `--json`. */
  switches?: readonly string[];
}

export type Flags = Record<string, string | true>;

export function parseFlags(argv: string[], spec: FlagSpec): Flags {
  const values = new Set(spec.values ?? []);
  const switches = new Set(spec.switches ?? []);
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const name = arg.replace(/^--/, '');

    if (switches.has(name)) {
      flags[name] = true;
      continue;
    }
    if (!values.has(name)) {
      throw new Error(`unknown option: ${arg}`);
    }

    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${arg} needs a value`);
    }
    flags[name] = value;
    i += 1;
  }

  return flags;
}

export function stringFlag(flags: Flags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

/** Read a numeric option, rejecting values a stage cannot act on. */
export function numberFlag(
  flags: Flags,
  name: string,
  bounds: { min?: number } = {},
): number | undefined {
  const raw = stringFlag(flags, name);
  if (raw === undefined) return undefined;

  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  if (bounds.min !== undefined && value < bounds.min) {
    throw new Error(`--${name} must be at least ${bounds.min}`);
  }
  return value;
}
