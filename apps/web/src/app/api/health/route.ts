import { NextResponse } from 'next/server';

/**
 * Liveness probe for platform health checks (Render `healthCheckPath`, container
 * orchestrators). Intentionally does not touch the database: it answers whether the
 * web process is up, not whether the data pipeline has run, so a cold/seeding boot
 * still reports healthy and the platform does not kill the container mid-seed.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok', service: 'leapfrog-web' });
}
