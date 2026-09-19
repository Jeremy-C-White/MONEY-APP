import { describe, expect, it } from 'vitest';
import { buildManualAccount } from './manual-accounts';
import { buildUnifiedAccountView } from './unified-accounts';

describe('buildUnifiedAccountView', () => {
  it('keeps property visible while excluding it from money-purpose buckets', () => {
    const home = buildManualAccount({
      institutionName: 'Property',
      accountName: 'Primary home',
      kind: 'real_estate',
      balance: 450000,
    }, 'manual_12345678-1234-1234-1234-123456789abc', '2026-09-19T12:00:00.000Z');

    const result = buildUnifiedAccountView({
      linkedAccounts: [],
      linkedBalances: [],
      manualAccounts: [home],
      overrides: new Map(),
    });

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      accountType: 'asset',
      accountSubtype: 'real_estate',
      current: 450000,
      includeInCash: false,
      includeInNetWorth: true,
    });
    expect(result.summary.buckets.unassigned).toEqual({
      accountCount: 0,
      knownBalanceCount: 0,
      total: null,
    });
  });
});
