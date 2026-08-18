import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveDatabasePath } from '@leapfrog/core';
import { NextResponse } from 'next/server';

/**
 * Liveness probe for platform health checks (Render `healthCheckPath`, container
 * orchestrators). Intentionally does not touch the database: it answers whether the
 * web process is up, not whether the data pipeline has run, so a cold/seeding boot
 * still reports healthy and the platform does not kill the container mid-seed.
 *
 * It does report the pipeline scheduler's last heartbeat (written by
 * `docker/scheduler.sh` next to the SQLite file) when one exists — the scheduler is a
 * background loop with no port of its own, so this is the one place an operator can
 * see "is it still ticking?" without reading container logs. A stale or missing
 * heartbeat never fails the probe; killing the web server would not fix the scheduler.
 */
export const dynamic = 'force-dynamic';

interface SchedulerHeartbeat {
  event: string;
  at: string;
  intervalSeconds: number;
}

interface SchedulerStatus extends SchedulerHeartbeat {
  /** No heartbeat within two intervals — the scheduler is likely wedged or dead. */
  stale: boolean;
}

function readSchedulerStatus(): SchedulerStatus | null {
  const path = join(dirname(resolveDatabasePath()), 'scheduler-heartbeat.json');

  let heartbeat: SchedulerHeartbeat;
  try {
    heartbeat = JSON.parse(readFileSync(path, 'utf8')) as SchedulerHeartbeat;
  } catch {
    // Absent or unreadable file just means no scheduler runs here (local dev,
    // compose web with RUN_SCHEDULER=0) — not an unhealthy service.
    return null;
  }

  const at = Date.parse(heartbeat.at);
  const staleAfterMs = heartbeat.intervalSeconds * 2 * 1000;
  const stale = !Number.isFinite(at) || Date.now() - at > staleAfterMs;

  return { ...heartbeat, stale };
}

export function GET(): NextResponse {
  return NextResponse.json({
    status: 'ok',
    service: 'leapfrog-web',
    scheduler: readSchedulerStatus(),
  });
}
