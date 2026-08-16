#!/bin/sh
# Worker role (docker-compose): wait for the web service to create/seed the shared
# database, then run the pipeline on a schedule. Kept a separate service to model the
# "compute decoupled from serving" architecture (docs/DESIGN.md §4).
set -e

DB_PATH="${LEAPFROG_DB_PATH:-/data/leapfrog.sqlite}"
export LEAPFROG_DB_PATH="$DB_PATH"
mkdir -p "${XDG_CACHE_HOME:-/data/.cache}"

echo "[worker] waiting for database at $DB_PATH…"
while [ ! -f "$DB_PATH" ]; do sleep 2; done
echo "[worker] database ready — starting pipeline scheduler."

exec sh docker/scheduler.sh
