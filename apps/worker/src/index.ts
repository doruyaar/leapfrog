import { greet } from '@leapfrog/core';

/**
 * Ingestion worker entrypoint. The source adapters, dedupe, enrichment, and
 * scheduling land in M2; this stub confirms the workspace + core wiring.
 */
function main(): void {
  console.log(`[worker] ${greet()}`);
}

main();
