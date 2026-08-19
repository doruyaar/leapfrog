import { describe, expect, it } from 'vitest';
import { detectContradiction } from './contradiction.js';

describe('detectContradiction', () => {
  it('flags opposing polarity terms about the same subject', () => {
    const result = detectContradiction(
      'Sonatype raised enterprise pricing',
      'Sonatype pricing was flat',
    );
    expect(result.contradicts).toBe(true);
    expect(result.signals.join(' ')).toContain('"raised" vs "flat"');
  });

  it('flags a negation flip on a shared content word', () => {
    const result = detectContradiction(
      'JFrog Artifactory supports air-gapped deployments',
      'Artifactory does not support air-gapped deployments',
    );
    expect(result.contradicts).toBe(true);
    expect(result.signals.join(' ')).toContain('negates "support"');
  });

  it('flags diverging percentages, amounts, and versions', () => {
    expect(
      detectContradiction(
        'raised enterprise pricing by 20%',
        'raised enterprise pricing by 10%',
      ).contradicts,
    ).toBe(true);
    expect(
      detectContradiction('now $98 per user', 'now $79 per user').contradicts,
    ).toBe(true);
    expect(
      detectContradiction('patched in version 2.3', 'patched in version 2.4').contradicts,
    ).toBe(true);
  });

  it('accepts matching figures and consistent restatements', () => {
    expect(
      detectContradiction(
        'raised enterprise pricing by 20%',
        'enterprise pricing went from flat to a 20% raise',
      ).contradicts,
    ).toBe(false);
    expect(
      detectContradiction(
        'Sonatype raised enterprise pricing',
        'Sonatype raised its pricing for enterprise customers',
      ).contradicts,
    ).toBe(false);
  });

  it('treats a refinement of the same account as no contradiction', () => {
    const result = detectContradiction(
      'Docker positions Sandboxes and AI Governance as controls for governing AI agents through isolated execution and policy enforcement',
      'Docker positions Sandboxes as dedicated microVM execution boundaries and AI Governance as centralized policy enforcement, while acknowledging limits',
    );
    expect(result.contradicts).toBe(false);
    expect(result.signals).toEqual([]);
  });

  it('never compares statements that share too little content', () => {
    // Polarity terms alone are not enough when the statements are about different things.
    const result = detectContradiction(
      'Sonatype raised pricing',
      'Docker cut its sales headcount',
    );
    expect(result.contradicts).toBe(false);
  });
});
