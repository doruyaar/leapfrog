#!/usr/bin/env bash
#
# Run the full live populate pipeline end to end:
#   fetch -> ingest -> enrich -> embed -> diff -> brief
#
# Only `enrich` fans out concurrent LLM requests (default 12); every other stage
# is inherently sequential. Core is built once up front rather than once per
# stage. Each stage is idempotent, so this is safe to re-run.
#
# Resilient by design: a partial failure (e.g. one source returns HTTP 403, or a
# single item fails to enrich) makes that stage exit non-zero, but the derived
# stages downstream still run on the data that *did* persist. Any failures are
# collected and reported at the end, and the script exits non-zero so CI notices.
#
# Usage:
#   scripts/populate-live.sh                 # run the whole pipeline
#   ENRICH_CONCURRENCY=6 scripts/populate-live.sh
#   scripts/populate-live.sh --since-days 7  # extra flags pass through to fetch+ingest
#
# Requires (for live mode): INGEST_LIVE=1 and OPENROUTER_API_KEY in your .env.
set -uo pipefail

cd "$(dirname "$0")/.."

ENRICH_CONCURRENCY="${ENRICH_CONCURRENCY:-12}"
# Extra flags (e.g. --since-days 7 --max 25) apply only to the source stages.
SOURCE_FLAGS=("$@")

FAILURES=()

# Run a pipeline stage without letting a non-zero exit abort the whole run.
# A stage returning non-zero here means "partial failure" (some work still
# persisted), so we record it and keep going to the derived stages.
worker() {
  local stage="$1"
  shift
  echo ""
  echo "==> ${stage} $*"
  if ! npm run "${stage}" --silent --workspace @leapfrog/worker -- "$@"; then
    echo "!! ${stage} exited non-zero (partial failure) — continuing." >&2
    FAILURES+=("${stage}")
  fi
}

echo "==> building @leapfrog/core"
if ! npm run build --silent --workspace @leapfrog/core; then
  echo "!! core build failed — aborting (nothing downstream can run)." >&2
  exit 1
fi

worker fetch ${SOURCE_FLAGS[@]+"${SOURCE_FLAGS[@]}"}
worker ingest ${SOURCE_FLAGS[@]+"${SOURCE_FLAGS[@]}"}
worker enrich --concurrency "${ENRICH_CONCURRENCY}"
worker embed
worker diff
worker brief

echo ""
if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo "Pipeline finished with partial failures in: ${FAILURES[*]}"
  echo "Data from the stages that succeeded was still persisted."
  echo "Run 'npm run dev' to view. (Tip: set GITHUB_TOKEN to avoid GitHub 403s.)"
  exit 1
fi

echo "Done. Live pipeline complete — run 'npm run dev' to view."
