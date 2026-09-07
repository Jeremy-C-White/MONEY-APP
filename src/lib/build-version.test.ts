import { describe, expect, it } from 'vitest';
import { normalizeBuildCommit, shortBuildCommit } from './build-version';

describe('build version', () => {
  it('normalizes a valid injected commit', () => {
    expect(normalizeBuildCommit(' 3E60E7F423515B1CE41232D29C205C359B549437 '))
      .toBe('3e60e7f423515b1ce41232d29c205c359b549437');
  });

  it('does not invent a version when injection is unavailable', () => {
    expect(normalizeBuildCommit('')).toBeNull();
    expect(normalizeBuildCommit('main')).toBeNull();
    expect(shortBuildCommit(null)).toBe('Unavailable');
  });
});
