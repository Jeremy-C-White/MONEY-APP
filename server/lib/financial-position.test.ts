import { describe, expect, it } from 'vitest';
import { buildFinancialPosition } from './financial-position';
import type { UnifiedAccount } from './unified-accounts';

function account(overrides: Partial<UnifiedAccount> = {}): UnifiedAccount {
  return {
    accountId: 'checking', institutionName: 'Bank', accountName: 'Checking', accountMask: '',
    accountType: 'depository', accountSubtype: 'checking', health: 'healthy',
    role: 'operating', roleSource: 'default', defaultRole: 'operating', suggestedRole: null,
    requiresRoleConfirmation: false, current: 1000, available: 900, isoCurrencyCode: 'USD',
    fetchedAt: '2026-09-14T12:00:00.000Z', balanceStatus: 'fresh', source: 'linked',
    manualKind: null, includeInCash: true, includeInNetWorth: true, duplicateOfAccountId: null,
    ...overrides,
  };
}

describe('buildFinancialPosition', () => {
  it('includes manual savings in cash, savings, and net worth once', () => {
    const result = buildFinancialPosition({ accounts: [
      account(),
      account({
        accountId: 'apple', accountName: 'Apple Savings', role: 'reserve', defaultRole: 'reserve',
        current: 5000, available: null, source: 'manual', manualKind: 'savings',
      }),
      account({
        accountId: 'duplicate', accountName: 'Apple Savings copy', role: 'reserve', defaultRole: 'reserve',
        current: 5000, available: null, source: 'manual', manualKind: 'savings', duplicateOfAccountId: 'apple',
      }),
    ] });

    expect(result.liquidCash).toBe(6000);
    expect(result.liquidChecking).toBe(1000);
    expect(result.liquidSavings).toBe(5000);
    expect(result.estimatedNetWorth).toBe(6000);
    expect(result.breakdown).toEqual({
      cashAndSavings: 6000,
      investmentsAndRetirement: null,
      propertyAndVehicles: null,
      liabilities: null,
    });
    expect(result.excludedDuplicateCount).toBe(1);
  });

  it('separates retirement from liquid savings and computes context from complete snapshots', () => {
    const retirement = account({
      accountId: '401k', accountName: '401(k)', accountType: 'investment', accountSubtype: '401k',
      role: 'retirement', defaultRole: 'retirement', current: 3000, available: null,
      includeInCash: false,
    });
    const result = buildFinancialPosition({
      accounts: [account({ current: 7000 }), retirement],
      balanceSnapshots: [
        { date: '2026-08-01', items: { item: { accounts: [{ accountId: '401k', current: 2500, isoCurrencyCode: 'USD' }] } } },
        { date: '2026-09-01', items: { item: { accounts: [{ accountId: '401k', current: 3000, isoCurrencyCode: 'USD' }] } } },
      ],
    });

    expect(result.liquidCash).toBe(7000);
    expect(result.liquidChecking).toBe(7000);
    expect(result.liquidSavings).toBeNull();
    expect(result.estimatedNetWorth).toBe(10000);
    expect(result.retirement.total).toBe(3000);
    expect(result.retirement.shareOfNetWorth).toBe(0.3);
    expect(result.retirement.trend).toMatchObject({ change: 500, percentageChange: 0.2 });
    expect(result.retirement.contributionDataAvailable).toBe(false);
  });

  it('marks net worth history gaps instead of charting incomplete account coverage', () => {
    const result = buildFinancialPosition({
      accounts: [account(), account({
        accountId: 'apple', role: 'reserve', defaultRole: 'reserve', current: 5000,
        source: 'manual', manualKind: 'savings', available: null,
      })],
      balanceSnapshots: [
        { date: '2026-09-13', items: { bank: { accounts: [{ accountId: 'checking', current: 1000, isoCurrencyCode: 'USD' }] } } },
        { date: '2026-09-14', items: { bank: { accounts: [{ accountId: 'checking', current: 1000, isoCurrencyCode: 'USD' }] } }, manualAccounts: { apple: { accountId: 'apple', balance: 5000, isoCurrencyCode: 'USD' } } },
      ],
    });

    expect(result.netWorthHistory).toEqual([
      { date: '2026-09-13', estimatedNetWorth: null, liquidCash: null, coveredAccountCount: 1, expectedAccountCount: 2, status: 'partial' },
      { date: '2026-09-14', estimatedNetWorth: 6000, liquidCash: 6000, coveredAccountCount: 2, expectedAccountCount: 2, status: 'complete' },
    ]);
  });

  it('withholds combined totals for mixed currencies', () => {
    const result = buildFinancialPosition({ accounts: [
      account(), account({ accountId: 'cad', current: 200, isoCurrencyCode: 'CAD' }),
    ] });
    expect(result.mixedCurrency).toBe(true);
    expect(result.currency).toBeNull();
    expect(result.estimatedNetWorth).toBeNull();
    expect(result.liquidChecking).toBeNull();
  });

  it('does not present health savings or unassigned deposits as liquid household cash', () => {
    const result = buildFinancialPosition({ accounts: [
      account(),
      account({ accountId: 'hsa', role: 'health_savings', defaultRole: 'health_savings', current: 5000 }),
      account({ accountId: 'unknown', role: 'unassigned', defaultRole: 'unassigned', current: 300 }),
    ] });
    expect(result.liquidCash).toBe(1000);
    expect(result.liquidChecking).toBe(1000);
    expect(result.estimatedNetWorth).toBe(6300);
  });

  it('includes manually estimated property in net worth without treating it as liquid cash', () => {
    const result = buildFinancialPosition({ accounts: [
      account(),
      account({
        accountId: 'home', institutionName: 'Property', accountName: 'Primary home',
        accountType: 'asset', accountSubtype: 'real_estate', current: 450000,
        available: null, source: 'manual', manualKind: 'real_estate', includeInCash: false,
        role: 'unassigned', defaultRole: 'unassigned', requiresRoleConfirmation: true,
      }),
      account({
        accountId: 'lexus', institutionName: 'Vehicles', accountName: 'Lexus TX',
        accountType: 'asset', accountSubtype: 'vehicle', current: 55000,
        available: null, source: 'manual', manualKind: 'vehicle', includeInCash: false,
        role: 'unassigned', defaultRole: 'unassigned', requiresRoleConfirmation: true,
      }),
    ] });

    expect(result.liquidCash).toBe(1000);
    expect(result.estimatedNetWorth).toBe(506000);
    expect(result.includedAccountCount).toBe(3);
    expect(result.breakdown).toEqual({
      cashAndSavings: 1000,
      investmentsAndRetirement: null,
      propertyAndVehicles: 505000,
      liabilities: null,
    });
  });

  it('shows credit balances separately while subtracting them from net worth', () => {
    const result = buildFinancialPosition({ accounts: [
      account(),
      account({
        accountId: 'card', accountType: 'credit', accountSubtype: 'credit card',
        role: 'debt', defaultRole: 'debt', current: 250, available: null,
        includeInCash: false,
      }),
    ] });

    expect(result.estimatedNetWorth).toBe(750);
    expect(result.breakdown.liabilities).toBe(250);
  });
});
