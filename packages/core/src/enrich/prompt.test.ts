import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../db/schema.js';
import {
  buildEnrichMessages,
  ENRICH_PROMPT_VERSION,
  loadEnrichPromptTemplate,
  type PromptInput,
} from './prompt.js';

const INPUT: PromptInput = {
  title: 'Nexus Repository 3.99 released',
  content: 'Adds SLSA provenance and a new REST API.',
  url: 'https://example.test/nexus-3-99',
  vendor: 'Sonatype',
  sourceName: 'Nexus Releases',
  publishedAt: new Date('2026-08-13T00:00:00Z'),
};

describe('enrich prompt', () => {
  it('exposes a version constant stamped onto stored rows', () => {
    expect(ENRICH_PROMPT_VERSION).toMatch(/^enrich@/);
  });

  it('loads a system and a user template from prompts/enrich.md', () => {
    const template = loadEnrichPromptTemplate();
    expect(template.system.length).toBeGreaterThan(0);
    expect(template.user.length).toBeGreaterThan(0);
  });

  it('renders system + user messages with placeholders filled', () => {
    const [system, user] = buildEnrichMessages(INPUT, 'JFrog');

    expect(system!.role).toBe('system');
    expect(system!.content).toContain('JFrog');
    expect(system!.content).toContain(CATEGORIES.join(', '));
    // No unresolved placeholders leak into the rendered prompt.
    expect(system!.content).not.toMatch(/\{\{\w+\}\}/);

    expect(user!.role).toBe('user');
    expect(user!.content).toContain(INPUT.title);
    expect(user!.content).toContain(INPUT.content);
    expect(user!.content).toContain('Sonatype');
    expect(user!.content).not.toMatch(/\{\{\w+\}\}/);
  });

  it('falls back to "unknown" for a missing vendor and date', () => {
    const [, user] = buildEnrichMessages({ ...INPUT, vendor: null, publishedAt: null });
    expect(user!.content).toContain('unknown');
  });
});
