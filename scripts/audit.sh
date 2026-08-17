#!/usr/bin/env bash
#
# Safe, responsible security audit.
#
# JFrog's JAS secrets scanner walks the filesystem directly and does NOT honor
# .gitignore, so a plain `jfrog audit` reads local-only material that never
# reaches the repo: the real key in .env, and build artifacts under .next/,
# dist/, coverage/, etc. Its `--exclusions` flag only prunes *directories* —
# it cannot exclude a root-level file such as .env (verified empirically).
#
# To avoid scanning (and reporting) secrets that are never uploaded to git,
# we audit a temporary snapshot that contains ONLY the files git tracks or
# would track — i.e. everything except gitignored paths. This guarantees
# local secrets are never read, while still catching anything that could
# actually leak into the repository.
#
# Any extra flags are forwarded to `jfrog audit`, e.g.
#   npm run audit -- --sast --format=sarif
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

snapshot="$(mktemp -d)"
trap 'rm -rf "$snapshot"' EXIT

# Files git sees: tracked (--cached) + untracked (--others), minus anything
# ignored by .gitignore (--exclude-standard). NUL-delimited for safe paths.
git ls-files --cached --others --exclude-standard -z \
  | rsync -a --files-from=- --from0 ./ "$snapshot/"

export PATH="$repo_root/node_modules/.bin:$PATH"
cd "$snapshot"
jfrog audit --npm "$@"
