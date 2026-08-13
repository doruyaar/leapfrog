/**
 * @leapfrog/core — shared schema, db access, LLM client, and prompts.
 * Populated across the M1/M2 milestones.
 */

export * from './db/index.js';
export * from './ingest/index.js';

export const APP_NAME = 'LeapFrog';

export type Milestone = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

export function greet(name: string = APP_NAME): string {
  return `${name} ready.`;
}
