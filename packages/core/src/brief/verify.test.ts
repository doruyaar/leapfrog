import { describe, expect, it } from 'vitest';
import {
  createHttpUrlVerifier,
  pageMatchesItem,
  significantTerms,
  type VerifiableItem,
} from './verify.js';

describe('significantTerms', () => {
  it('keeps meaningful tokens and drops short words and stopwords', () => {
    const terms = significantTerms('The new Artifactory release for JFrog');
    expect(terms).toContain('artifactory');
    expect(terms).toContain('release');
    expect(terms).toContain('jfrog');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('new'); // stopword
  });
});

describe('pageMatchesItem', () => {
  const item: VerifiableItem = {
    url: 'https://jfrog.com/blog/artifactory-release',
    title: 'Artifactory release adds SBOM export',
    vendor: 'JFrog',
  };

  it('passes when the vendor and enough title terms appear', () => {
    const page =
      'JFrog announced the Artifactory release with a new SBOM export feature.';
    expect(pageMatchesItem(page, item)).toBe(true);
  });

  it('fails when the vendor is absent', () => {
    const page = 'A totally unrelated page about container registries and SBOM export.';
    expect(pageMatchesItem(page, item)).toBe(false);
  });

  it('fails when too few title terms appear', () => {
    const page = 'JFrog is a company.';
    expect(pageMatchesItem(page, item)).toBe(false);
  });
});

describe('createHttpUrlVerifier', () => {
  const item: VerifiableItem = {
    url: 'https://example.test/post',
    title: 'Sonatype Nexus pricing change',
    vendor: 'Sonatype',
  };

  it('returns verified for a reachable, relevant page', async () => {
    const verifier = createHttpUrlVerifier({
      fetch: async () =>
        new Response('Sonatype announced a Nexus pricing change today.', { status: 200 }),
    });
    expect(await verifier.verify(item)).toBe('verified');
  });

  it('returns irrelevant for a reachable but off-topic page', async () => {
    const verifier = createHttpUrlVerifier({
      fetch: async () =>
        new Response('Welcome to our unrelated marketing homepage.', { status: 200 }),
    });
    expect(await verifier.verify(item)).toBe('irrelevant');
  });

  it('returns unreachable when the fetch fails', async () => {
    const verifier = createHttpUrlVerifier({
      attempts: 1,
      fetch: async () => new Response('nope', { status: 404 }),
    });
    expect(await verifier.verify(item)).toBe('unreachable');
  });
});
