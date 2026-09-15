import { describe, expect, it } from 'vitest';
import { buildMerchantComparison } from './merchant-comparison';
import type { NormalizedTransaction } from './financial';

function transaction(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
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

describe('buildMerchantComparison', () => {
  it('compares month to date with the same completed span last month', () => {
    const result = buildMerchantComparison({
      asOfDate: '2026-09-14',
      transactions: [
        transaction({ transactionId: 'current-a', normalizedDate: '2026-09-02', normalizedMerchant: 'Market', spendingAdjustment: 80 }),
        transaction({ transactionId: 'current-b', normalizedDate: '2026-09-10', normalizedMerchant: 'Market', spendingAdjustment: -10 }),
        transaction({ transactionId: 'previous', normalizedDate: '2026-08-12', normalizedMerchant: 'Market', spendingAdjustment: 50 }),
        transaction({ transactionId: 'too-late', normalizedDate: '2026-08-20', normalizedMerchant: 'Market', spendingAdjustment: 999 }),
      ],
    });

    expect(result.previousComparablePeriod).toEqual({ startDate: '2026-08-01', endDate: '2026-08-14' });
    expect(result.merchants[0]).toMatchObject({
      merchant: 'Market', currentSpending: 70, previousSpending: 50,
      difference: 20, percentageChange: 40, transactionCount: 2, isNew: false,
    });
  });

  it('flags a current merchant as new and ignores pending or excluded activity', () => {
    const result = buildMerchantComparison({
      asOfDate: '2026-09-14',
      transactions: [
        transaction({ normalizedMerchant: 'New Shop', spendingAdjustment: 25 }),
        transaction({ transactionId: 'pending', normalizedMerchant: 'Pending Shop', pending: true, spendingAdjustment: 100 }),
        transaction({ transactionId: 'transfer', normalizedMerchant: 'Transfer', countsTowardSpending: false, spendingAdjustment: 100 }),
      ],
    });

    expect(result.merchants).toEqual([expect.objectContaining({
      merchant: 'New Shop', previousSpending: 0, isNew: true,
    })]);
  });
});
