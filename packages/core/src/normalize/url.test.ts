import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, InvalidUrlError } from './url.js';

describe('canonicalizeUrl', () => {
  it('collapses the spellings that address the same document', () => {
    const canonical = 'https://jfrog.com/blog/artifactory-release';

    for (const variant of [
      'https://jfrog.com/blog/artifactory-release',
      'HTTPS://JFrog.com/blog/artifactory-release',
      'https://www.jfrog.com/blog/artifactory-release/',
      'https://jfrog.com:443/blog//artifactory-release',
      'https://jfrog.com/blog/artifactory-release#section-2',
      'https://jfrog.com/blog/artifactory-release?utm_source=feed&utm_medium=rss',
      'jfrog.com/blog/artifactory-release',
      '  https://jfrog.com/blog/artifactory-release  ',
    ]) {
      expect(canonicalizeUrl(variant)).toBe(canonical);
    }
  });

  it('keeps parameters that select the document, in a stable order', () => {
    expect(canonicalizeUrl('https://nvd.nist.gov/vuln?id=CVE-2026-3199&view=full')).toBe(
      'https://nvd.nist.gov/vuln?id=CVE-2026-3199&view=full',
    );
    expect(canonicalizeUrl('https://nvd.nist.gov/vuln?view=full&id=CVE-2026-3199')).toBe(
      'https://nvd.nist.gov/vuln?id=CVE-2026-3199&view=full',
    );
    expect(canonicalizeUrl('https://x.test/p?page=2&gclid=abc&ref=twitter')).toBe(
      'https://x.test/p?page=2',
    );
  });

  it('keeps a non-default port and a case-sensitive path', () => {
    expect(canonicalizeUrl('https://Registry.test:8443/Repo/Package')).toBe(
      'https://registry.test:8443/Repo/Package',
    );
  });

  it('preserves the scheme, since http and https can serve different documents', () => {
    expect(canonicalizeUrl('http://legacy.test/post')).toBe('http://legacy.test/post');
  });

  it('rejects anything that cannot address an HTTP document', () => {
    for (const bad of [
      '',
      '   ',
      'mailto:ci@jfrog.com',
      'javascript:alert(1)',
      'http://',
    ]) {
      expect(() => canonicalizeUrl(bad)).toThrow(InvalidUrlError);
    }
  });
});
