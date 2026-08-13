import { describe, expect, it } from 'vitest';
import { hashContent, hashUrl, normalizeForHash, sha256Hex } from './hash.js';

describe('hashing', () => {
  it('produces stable hex SHA-256 digests', () => {
    expect(sha256Hex('leapfrog')).toHaveLength(64);
    expect(sha256Hex('leapfrog')).toBe(sha256Hex('leapfrog'));
    expect(hashUrl('https://jfrog.com/blog/a')).not.toBe(
      hashUrl('https://jfrog.com/blog/b'),
    );
  });

  it('folds away differences that do not change what the text says', () => {
    expect(normalizeForHash('  Artifactory\n\tRelease\u200b ')).toBe(
      'artifactory release',
    );
    expect(hashContent('Release notes', 'Line one\nLine two')).toBe(
      hashContent('  release   NOTES ', 'Line one    Line two'),
    );
  });

  it('separates title from body so a moved boundary changes the hash', () => {
    expect(hashContent('Nexus outage', 'resolved')).not.toBe(
      hashContent('Nexus', 'outage resolved'),
    );
  });
});
