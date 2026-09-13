import { describe, expect, it } from 'vitest';
import type { AccountBalanceRecord } from './account-balances';
import type { ConnectedAccountRecord } from './connected-accounts';
import { buildAccountRoleView } from './account-role-view';

function connected(overrides: Partial<ConnectedAccountRecord> = {}): ConnectedAccountRecord {
  return {
    accountId: 'checking-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    health: 'healthy',
    ...overrides,
  };
}

function balance(overrides: Partial<AccountBalanceRecord> = {}): AccountBalanceRecord {
  return {
    ...connected(),
    current: 1000,
    available: 900,
    limit: null,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    fetchedAt: '2026-09-07T12:00:00.000Z',
    balanceStatus: 'fresh',
    ...overrides,
  };
}

describe('buildAccountRoleView', () => {
  it('joins balances, resolves roles, and totals each role on the server', () => {
    const savings = connected({
      accountId: 'savings-1',
      accountName: 'Savings',
      accountSubtype: 'savings',
    });
    const retirement = connected({
      accountId: 'retirement-1',
      accountName: '401k',
      accountType: 'investment',
      accountSubtype: '401k',
    });
    const result = buildAccountRoleView({
      connectedAccounts: [connected(), savings, retirement],
      balanceAccounts: [
        balance(),
        balance({ ...savings, current: 5000, available: 5000 }),
        balance({ ...retirement, current: 25000, available: null }),
      ],
      overrides: new Map(),
    });

    expect(result.accounts.map(account => account.role)).toEqual([
      'operating', 'reserve', 'retirement',
    ]);
    expect(result.summary.currency).toBe('USD');
    expect(result.summary.buckets.operating.total).toBe(1000);
    expect(result.summary.buckets.reserve.total).toBe(5000);
    expect(result.summary.buckets.retirement.total).toBe(25000);
  });

  it('applies an owner override and preserves the evidence-based default', () => {
    const result = buildAccountRoleView({
      connectedAccounts: [connected({ accountSubtype: 'savings' })],
      balanceAccounts: [balance({ accountSubtype: 'savings' })],
      overrides: new Map([['checking-1', 'operating']]),
    });

    expect(result.accounts[0]).toMatchObject({
      role: 'operating',
      roleSource: 'owner',
      defaultRole: 'reserve',
    });
  });

  it('keeps missing balances explicit instead of inventing zero', () => {
    const result = buildAccountRoleView({
      connectedAccounts: [connected()],
      balanceAccounts: [],
      overrides: new Map(),
    });

    expect(result.accounts[0]).toMatchObject({ current: null, balanceStatus: 'missing' });
    expect(result.summary.buckets.operating).toEqual({
      accountCount: 1,
      knownBalanceCount: 0,
      total: null,
    });
  });

  it('withholds mixed-currency totals', () => {
    const second = connected({ accountId: 'checking-2', accountName: 'Second checking' });
    const result = buildAccountRoleView({
      connectedAccounts: [connected(), second],
      balanceAccounts: [balance(), balance({ ...second, current: 600, isoCurrencyCode: 'CAD' })],
      overrides: new Map(),
    });

    expect(result.summary.currency).toBeNull();
    expect(result.summary.buckets.operating.total).toBeNull();
  });
});
