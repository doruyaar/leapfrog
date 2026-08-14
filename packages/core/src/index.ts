/**
 * @leapfrog/core — shared schema, db access, LLM client, and prompts.
 * Populated across the M1/M2 milestones.
 */

export * from './battlecard/index.js';
export * from './brief/index.js';
export * from './db/index.js';
export * from './diff/index.js';
export * from './embed/index.js';
export * from './enrich/index.js';
export * from './ingest/index.js';
export * from './matrix/index.js';
export * from './normalize/index.js';
export * from './query/index.js';
export * from './retrieve/index.js';
export * from './seed/index.js';

export const APP_NAME = 'LeapFrog';

export type Milestone = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

export function greet(name: string = APP_NAME): string {
  return `${name} ready.`;
}
