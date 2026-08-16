#!/bin/sh
# Web role: make sure the SQLite store exists, optionally run the in-container
# pipeline scheduler, then serve the Next.js app.
set -e

DB_PATH="${LEAPFROG_DB_PATH:-/data/leapfrog.sqlite}"
export LEAPFROG_DB_PATH="$DB_PATH"
mkdir -p "$(dirname "$DB_PATH")" "${XDG_CACHE_HOME:-/data/.cache}"

# First boot on a fresh disk has no database. Seed the committed demo snapshot so the
# UI is populated immediately (idempotent, but skipped when the file already exists to
# avoid re-downloading the embedding model on every restart).
if [ ! -f "$DB_PATH" ]; then
  echo "[web] no database at $DB_PATH — seeding demo snapshot (first boot)…"
  node apps/worker/dist/index.js seed
else
  echo "[web] database present at $DB_PATH — skipping seed."
fi

# On platforms where a persistent disk attaches to a single service (Render), the
# worker cannot be its own container, so the pipeline co-locates here. In compose the
# worker is a separate service and this stays off (RUN_SCHEDULER=0).
if [ "${RUN_SCHEDULER:-0}" = "1" ]; then
  echo "[web] starting in-container pipeline scheduler…"
  sh docker/scheduler.sh &
fi

echo "[web] starting Next.js on :${PORT:-3000}"
exec ./node_modules/.bin/next start apps/web -p "${PORT:-3000}" -H 0.0.0.0
