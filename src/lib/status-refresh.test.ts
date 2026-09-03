import { describe, expect, it } from 'vitest';
import {
  STATUS_REFRESH_INTERVAL_MS,
  shouldRefreshStatus,
} from './status-refresh';

describe('status refresh scheduling', () => {
  it('refreshes when no status request has been attempted', () => {
    expect(shouldRefreshStatus(null, 1_000, true)).toBe(true);
  });

  it('does not refresh a hidden tab', () => {
    expect(shouldRefreshStatus(null, 1_000, false)).toBe(false);
  });

  it('waits five minutes between automatic refresh attempts', () => {
    const lastAttemptAt = 1_000;
    expect(shouldRefreshStatus(
      lastAttemptAt,
      lastAttemptAt + STATUS_REFRESH_INTERVAL_MS - 1,
      true
    )).toBe(false);
    expect(shouldRefreshStatus(
      lastAttemptAt,
      lastAttemptAt + STATUS_REFRESH_INTERVAL_MS,
      true
    )).toBe(true);
  });
});
