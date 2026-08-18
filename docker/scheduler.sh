#!/bin/sh
# Minimal pipeline scheduler: run the worker stages every SCHEDULE_INTERVAL_SECONDS.
# A deliberately trivial loop, not a cron daemon — the product's stages are all
# idempotent (docs/DESIGN.md §5), so re-running is always safe and a missed tick just
# means the next pass catches up. Swap for EventBridge/Container Apps Jobs at scale.
set -e

INTERVAL="${SCHEDULE_INTERVAL_SECONDS:-21600}" # default: every 6 hours
WORKER="node apps/worker/dist/index.js"

# Liveness breadcrumb, written next to the SQLite file so /api/health can report
# whether the scheduler is alive without the two processes sharing anything but the
# disk they already share.
HEARTBEAT="$(dirname "${LEAPFROG_DB_PATH:-/data/leapfrog.sqlite}")/scheduler-heartbeat.json"

# beat <event> — record the last scheduler event. Written via tmp + rename so a
# concurrent health-check read never sees a torn file; never fatal (set -e above).
beat() {
  {
    printf '{"event":"%s","at":"%s","intervalSeconds":%s}\n' \
      "$1" "$(date -u +%FT%TZ)" "$INTERVAL" > "$HEARTBEAT.tmp" \
      && mv "$HEARTBEAT.tmp" "$HEARTBEAT"
  } 2> /dev/null || true
}

run_pass() {
  echo "[scheduler] pipeline pass @ $(date -u +%FT%TZ)"
  beat pass-started
  # Live stages need network + an OpenRouter key; only run them when opted in.
  # (No separate `fetch` pass: ingest fetches the sources itself, so running fetch
  # first would just hit every feed twice per pass.)
  if [ "${INGEST_LIVE:-0}" = "1" ]; then
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
  beat pass-completed
}

# First pass runs immediately: every deploy/restart replaces this process, so a
# sleep-first loop under frequent deploys (Render autoDeploy) could keep resetting
# the timer and never reach a pass at all. Stages are idempotent, so an "extra"
# pass after a restart costs a re-read and writes nothing.
run_pass

while true; do
  sleep "$INTERVAL"
  run_pass
done
