import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import { buildYearOverYearComparison } from './year-over-year';

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

describe('buildYearOverYearComparison', () => {
  it('compares spending only when both periods have the same contributing accounts', () => {
    const result = buildYearOverYearComparison({
      asOfDate: '2026-09-19',
      transactions: [
        transaction({ transactionId: 'current', accountId: 'checking', normalizedDate: '2026-09-10', spendingAdjustment: 120 }),
        transaction({ transactionId: 'prior', accountId: 'checking', normalizedDate: '2025-09-10', spendingAdjustment: 100 }),
      ],
    });
    expect(result).toMatchObject({
      status: 'comparable', currentSpending: 120, previousSpending: 100,
      difference: 20, percentageChange: 20, addedAccountCount: 0, removedAccountCount: 0,
    });
  });

  it('withholds the conclusion when a new account changes coverage', () => {
    const result = buildYearOverYearComparison({
      asOfDate: '2026-09-19',
      transactions: [
        transaction({ transactionId: 'current-a', accountId: 'checking', normalizedDate: '2026-09-10' }),
        transaction({ transactionId: 'current-b', accountId: 'new-card', normalizedDate: '2026-09-11' }),
        transaction({ transactionId: 'prior', accountId: 'checking', normalizedDate: '2025-09-10' }),
      ],
    });
    expect(result.status).toBe('not_comparable');
    expect(result.addedAccountCount).toBe(1);
  });
});
