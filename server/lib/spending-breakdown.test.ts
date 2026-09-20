import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import { buildSpendingBreakdown, resolveSpendingPeriod } from './spending-breakdown';

type LabelAwareTransaction = NormalizedTransaction & { householdLabel?: string | null };

function transaction(overrides: Partial<LabelAwareTransaction>): LabelAwareTransaction {
  return {
    transactionId: 'tx', accountId: 'checking', institutionName: 'Bank', accountName: 'Checking',
    accountMask: '1234', accountType: 'depository', accountSubtype: 'checking', rawDate: '2026-09-01',
    normalizedDate: '2026-09-01', name: 'Merchant', normalizedMerchant: 'Merchant', plaidAmount: 10,
    cashFlowAmount: -10, categoryPrimary: 'GENERAL_MERCHANDISE', categoryDetailed: 'GENERAL_MERCHANDISE_OTHER',
    normalizedCategory: 'General merchandise', pending: false, pendingTransactionId: '', status: 'posted',
    removed: false, classification: 'spending', countsTowardSpending: true, countsTowardIncome: false,
    spendingAdjustment: 10, incomeAdjustment: 0, isOverridden: false, overrideNote: null,
    overrideOffsetCategory: null, ...overrides,
  };
}

describe('resolveSpendingPeriod', () => {
  it.each([
    ['last_7_days', '2026-09-13', '2026-09-06', '2026-09-12'],
    ['last_30_days', '2026-08-21', '2026-07-22', '2026-08-20'],
    ['last_3_months', '2026-06-20', '2026-03-20', '2026-06-19'],
    ['last_12_months', '2025-09-20', '2024-09-20', '2025-09-19'],
  ] as const)('resolves %s with exact inclusive dates', (period, start, previousStart, previousEnd) => {
    expect(resolveSpendingPeriod(period, '2026-09-19')).toEqual({
      currentPeriod: { startDate: start, endDate: '2026-09-19' },
      previousComparablePeriod: { startDate: previousStart, endDate: previousEnd },
    });
  });
});

describe('buildSpendingBreakdown', () => {
  it('uses merchant families and returns full ranked category and merchant lists', () => {
    const report = buildSpendingBreakdown({
      asOfDate: '2026-09-19',
      period: 'last_7_days',
      transactions: [
        transaction({ transactionId: 'a', normalizedDate: '2026-09-18', name: 'AMZN Mktp US*ABC', normalizedMerchant: 'AMZN Mktp US', normalizedCategory: 'Shopping', spendingAdjustment: 80 }),
        transaction({ transactionId: 'b', normalizedDate: '2026-09-17', name: 'Amazon.com', normalizedMerchant: 'Amazon.com', normalizedCategory: 'Shopping', spendingAdjustment: 20 }),
        transaction({ transactionId: 'prior', normalizedDate: '2026-09-10', name: 'AMZN Mktp US*XYZ', normalizedMerchant: 'AMZN Mktp US', normalizedCategory: 'Shopping', spendingAdjustment: 50 }),
      ],
    });

    expect(report.currentPeriod).toEqual({ startDate: '2026-09-13', endDate: '2026-09-19' });
    expect(report.merchants).toEqual([expect.objectContaining({
      merchant: 'Amazon', currentSpending: 100, previousSpending: 50,
      difference: 50, transactionCount: 2,
    })]);
    expect(report.categories[0]).toMatchObject({
      category: 'Shopping', currentSpending: 100, previousSpending: 50, percentage: 1,
    });
  });

  it('uses null comparisons when the previous window has no ledger activity', () => {
    const report = buildSpendingBreakdown({
      asOfDate: '2026-09-19', period: 'last_7_days',
      transactions: [transaction({ normalizedDate: '2026-09-18', spendingAdjustment: 25 })],
    });
    expect(report.merchants[0]).toMatchObject({ previousSpending: null, difference: null });
  });

  it('groups household labels above Plaid categories and exposes the Walmart share', () => {
    const report = buildSpendingBreakdown({
      asOfDate: '2026-09-19',
      period: 'last_30_days',
      transactions: [
        transaction({
          transactionId: 'preschool-1', normalizedDate: '2026-09-10',
          name: 'BROOKWOOD PRESCHOOL', normalizedMerchant: 'Brookwood Preschool',
          normalizedCategory: 'General services', householdLabel: 'Preschool', spendingAdjustment: 500,
        }),
        transaction({
          transactionId: 'preschool-2', normalizedDate: '2026-09-03',
          name: 'BROOKWOOD PRESCHOOL', normalizedMerchant: 'Brookwood Preschool',
          normalizedCategory: 'Child care', householdLabel: 'Preschool', spendingAdjustment: 500,
        }),
        transaction({
          transactionId: 'walmart', normalizedDate: '2026-09-08',
          name: 'WALMART SUPERCENTER', normalizedMerchant: 'Walmart',
          normalizedCategory: 'General merchandise', spendingAdjustment: 125,
        }),
      ],
    });

    expect(report.categories[0]).toMatchObject({
      householdLabel: 'Preschool',
      currentSpending: 1000,
      sourceCategories: ['Child care', 'General services'],
    });
    expect(report.categories.find(category => category.category === 'General merchandise')?.walmart).toEqual({
      spending: 125,
      transactionCount: 1,
    });
  });
});
