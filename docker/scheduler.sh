#!/bin/sh
# Minimal pipeline scheduler: run the worker stages every SCHEDULE_INTERVAL_SECONDS.
# A deliberately trivial loop, not a cron daemon — the product's stages are all
# idempotent (docs/DESIGN.md §5), so re-running is always safe and a missed tick just
# means the next pass catches up. Swap for EventBridge/Container Apps Jobs at scale.
set -e

INTERVAL="${SCHEDULE_INTERVAL_SECONDS:-21600}" # default: every 6 hours
WORKER="node apps/worker/dist/index.js"

run_pass() {
  echo "[scheduler] pipeline pass @ $(date -u +%FT%TZ)"
  # Live stages need network + an OpenRouter key; only run them when opted in.
  if [ "${INGEST_LIVE:-0}" = "1" ]; then
    $WORKER fetch || echo "[scheduler] fetch failed (continuing)"
    $WORKER ingest || echo "[scheduler] ingest failed (continuing)"
    $WORKER enrich || echo "[scheduler] enrich failed (continuing)"
    # embed must run before diff: the diff similarity check reads the vector index,
    # so diffing un-embedded items would misclassify same-batch duplicates as "new"
    # (the seed path runs embed-then-diff for the same reason).
    $WORKER embed || echo "[scheduler] embed failed (continuing)"
    $WORKER diff || echo "[scheduler] diff failed (continuing)"
  fi
  # These run key-free (demo and live): recompose the brief and send digests.
  $WORKER brief || echo "[scheduler] brief failed (continuing)"
  $WORKER notify || echo "[scheduler] notify failed (continuing)"
}

while true; do
  sleep "$INTERVAL"
  run_pass
done
