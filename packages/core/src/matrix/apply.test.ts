import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { assetRevisions } from '../db/schema.js';
import {
  approveMatrixSuggestion,
  matrixCellKey,
  readMatrixCellAudit,
  readReviewedSuggestionIds,
  rejectMatrixSuggestion,
} from './apply.js';
import type { ComparisonMatrix, MatrixSuggestion } from './matrix.js';

const TEST_MATRIX: ComparisonMatrix = {
  focusVendor: 'JFrog',
  vendors: [
    { name: 'JFrog', slug: 'jfrog' },
    { name: 'Sonatype', slug: 'sonatype' },
  ],
  axes: [
    {
      id: 'security',
      label: 'Vulnerability scanning',
      description: 'Native scanning.',
      categories: ['Security'],
      cells: {
        JFrog: { level: 'strong', note: 'Xray' },
        Sonatype: { level: 'strong', note: 'Lifecycle' },
      },
    },
  ],
};

function makeSuggestion(overrides: Partial<MatrixSuggestion> = {}): MatrixSuggestion {
  return {
    suggestionId: 'Sonatype::security::42',
    vendor: 'Sonatype',
    axisId: 'security',
    axisLabel: 'Vulnerability scanning',
    currentLevel: 'strong',
    currentNote: 'Lifecycle',
    proposed: { level: 'strong', note: 'Lifecycle — CVE disclosed [#42]' },
    signalId: 42,
    signalTitle: 'Sonatype scanner CVE',
    signalSummary: 'A CVE was disclosed.',
    category: 'Security',
    impactScore: 5,
    publishedAt: new Date('2026-08-12T00:00:00Z'),
    score: 5,
    evidence: [],
    evidenceCount: 0,
    confidence: 'medium',
    confidenceFactors: {
      evidenceCount: 1,
      maxImpact: 5,
      freshness: 1,
      hasPrimarySource: false,
    },
    ...overrides,
  };
}

describe('matrix approval gate', () => {
  let db: Database;
  let dir: string;
  let matrixPath: string;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    runMigrations(db);
    dir = mkdtempSync(join(tmpdir(), 'leapfrog-matrix-'));
    matrixPath = join(dir, 'comparison-matrix.json');
    writeFileSync(matrixPath, JSON.stringify(TEST_MATRIX, null, 2), 'utf8');
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('approve applies the drafted edit to the asset and records the revision', () => {
    const suggestion = makeSuggestion();
    const result = approveMatrixSuggestion(db, suggestion, { matrixPath });

    expect(result.assetKey).toBe(matrixCellKey('Sonatype', 'security'));
    expect(result.before).toEqual({ level: 'strong', note: 'Lifecycle' });
    expect(result.after).toEqual(suggestion.proposed);

    const onDisk = JSON.parse(readFileSync(matrixPath, 'utf8')) as ComparisonMatrix;
    expect(onDisk.axes[0]!.cells['Sonatype']).toEqual(suggestion.proposed);
    // The rest of the asset is untouched.
    expect(onDisk.axes[0]!.cells['JFrog']).toEqual({ level: 'strong', note: 'Xray' });

    const revision = db.select().from(assetRevisions).get();
    expect(revision).toMatchObject({
      assetKind: 'matrix',
      assetKey: 'Sonatype::security',
      action: 'approve',
      suggestionId: suggestion.suggestionId,
      insightId: 42,
    });
  });

  it('reject records the decision without touching the asset', () => {
    const before = readFileSync(matrixPath, 'utf8');
    rejectMatrixSuggestion(db, makeSuggestion());

    expect(readFileSync(matrixPath, 'utf8')).toBe(before);
    const revision = db.select().from(assetRevisions).get();
    expect(revision).toMatchObject({ action: 'reject', after: null });
  });

  it('reviewed ids include both approvals and rejections', () => {
    approveMatrixSuggestion(db, makeSuggestion(), { matrixPath });
    rejectMatrixSuggestion(
      db,
      makeSuggestion({
        suggestionId: 'JFrog::security::7',
        vendor: 'JFrog',
        signalId: 7,
      }),
    );

    expect(readReviewedSuggestionIds(db)).toEqual(
      new Set(['Sonatype::security::42', 'JFrog::security::7']),
    );
  });

  it('audit exposes the latest approval per cell, ignoring rejections', () => {
    const suggestion = makeSuggestion();
    approveMatrixSuggestion(db, suggestion, { matrixPath });
    rejectMatrixSuggestion(
      db,
      makeSuggestion({ suggestionId: 'Sonatype::security::43' }),
    );

    const audit = readMatrixCellAudit(db);
    expect(audit.size).toBe(1);
    expect(audit.get('Sonatype::security')).toMatchObject({
      after: suggestion.proposed,
      signalId: 42,
    });
  });

  it('approve refuses a suggestion whose axis no longer exists', () => {
    expect(() =>
      approveMatrixSuggestion(db, makeSuggestion({ axisId: 'gone' }), { matrixPath }),
    ).toThrow(/no axis/);
    expect(db.select().from(assetRevisions).all()).toHaveLength(0);
  });
});
