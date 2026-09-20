import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import { buildRewardsYtd, isCashBackRewardTransaction } from './rewards';

function transaction(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    transactionId: 'reward-1',
    accountId: 'card-1',
    institutionName: 'Issuer',
    accountName: 'Rewards card',
    accountMask: '1234',
    accountType: 'credit',
    accountSubtype: 'credit card',
    rawDate: '',
    normalizedDate: '2026-06-15',
    name: 'Cashback Reward',
    normalizedMerchant: 'Cashback Reward',
    plaidAmount: 25,
    cashFlowAmount: 25,
    categoryPrimary: 'OTHER',
    categoryDetailed: 'OTHER_OTHER',
    normalizedCategory: 'REWARDS',
    pending: false,
    pendingTransactionId: '',
    status: 'posted',
    removed: false,
    classification: 'merchant_credit',
    countsTowardSpending: true,
    countsTowardIncome: false,
    spendingAdjustment: -25,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
    ...overrides,
  };
}

describe('year-to-date rewards', () => {
  it('sums posted cash-back credits from the current year', () => {
    const report = buildRewardsYtd([
      transaction({ transactionId: 'citi', cashFlowAmount: 25.5 }),
      transaction({ transactionId: 'paypal', name: 'PayPal Cashback Reward', normalizedMerchant: 'PayPal Cashback Reward', cashFlowAmount: 18.75 }),
      transaction({ transactionId: 'old', normalizedDate: '2025-12-31', cashFlowAmount: 100 }),
      transaction({ transactionId: 'pending', pending: true, cashFlowAmount: 10 }),
      transaction({ transactionId: 'paycheck', name: 'Payroll', normalizedMerchant: 'Payroll', cashFlowAmount: 3000 }),
    ], '2026-09-20');

    expect(report).toEqual({
      amount: 44.25,
      transactionCount: 2,
      startDate: '2026-01-01',
      endDate: '2026-09-20',
    });
  });

  it('does not count refunds even when their description contains cash-back wording', () => {
    expect(isCashBackRewardTransaction(transaction({
      name: 'Target cash back refund',
      normalizedMerchant: 'Target',
      classification: 'refund',
      categoryDetailed: 'GENERAL_MERCHANDISE_REFUND',
    }))).toBe(false);
  });
});
