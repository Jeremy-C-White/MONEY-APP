import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import {
  buildRecurringObligationId,
  detectLikelyRecurringObligations,
} from './recurring-obligations';

function spendingTransaction(
  transactionId: string,
  merchant: string,
  normalizedDate: string,
  amount: number,
  overrides: Partial<NormalizedTransaction> = {}
): NormalizedTransaction {
  return {
    transactionId,
    accountId: 'account-1',
    institutionName: 'Example Bank',
    accountName: 'Credit Card',
    accountMask: '1234',
    accountType: 'credit',
    accountSubtype: 'credit card',
    rawDate: normalizedDate,
    normalizedDate,
    name: merchant,
    normalizedMerchant: merchant,
    plaidAmount: amount,
    cashFlowAmount: -amount,
    categoryPrimary: 'RENT_AND_UTILITIES',
    categoryDetailed: 'RENT_AND_UTILITIES_TELEPHONE',
    normalizedCategory: 'RENT_AND_UTILITIES',
    pending: false,
    pendingTransactionId: '',
    status: 'posted',
    removed: false,
    classification: 'spending',
    countsTowardSpending: true,
    countsTowardIncome: false,
    spendingAdjustment: amount,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
    ...overrides,
  };
}

describe('detectLikelyRecurringObligations', () => {
  it('builds a stable merchant-level decision ID', () => {
    expect(buildRecurringObligationId('  Verizon  ')).toBe(
      buildRecurringObligationId('verizon')
    );
    expect(buildRecurringObligationId('Verizon')).not.toBe(
      buildRecurringObligationId('Spectrum')
    );
    expect(buildRecurringObligationId('Verizon')).toMatch(/^[a-f0-9]{24}$/);
  });

  it('detects a stable monthly bill and estimates one typical charge per month', () => {
    const transactions = [
      spendingTransaction('v1', 'Verizon', '2026-04-15', 120),
      spendingTransaction('v2', 'Verizon', '2026-05-15', 121),
      spendingTransaction('v3', 'Verizon', '2026-06-16', 119),
      spendingTransaction('v4', 'Verizon', '2026-07-15', 120),
      spendingTransaction('v5', 'Verizon', '2026-08-15', 120),
      spendingTransaction('latest', 'Grocer', '2026-09-01', 10),
    ];

    const report = detectLikelyRecurringObligations(transactions);

    expect(report.analyzedThrough).toBe('2026-09-01');
    expect(report.obligations).toHaveLength(1);
    expect(report.obligations[0]).toMatchObject({
      merchant: 'Verizon',
      cadence: 'monthly',
      confidence: 'high',
      amountBehavior: 'stable',
      typicalCharge: 120,
      estimatedMonthlyAmount: 120,
      occurrenceCount: 5,
      lastChargeDate: '2026-08-15',
    });
    expect(report.estimatedMonthlyTotal).toBe(120);
  });

  it('detects a stable weekly service and converts it to a monthly estimate', () => {
    const dates = [
      '2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22',
      '2026-07-29', '2026-08-05', '2026-08-12',
    ];
    const transactions = dates.map((date, index) => (
      spendingTransaction(`lawn-${index}`, 'Lawnstarter', date, 50)
    ));

    const report = detectLikelyRecurringObligations(transactions);

    expect(report.obligations[0].cadence).toBe('weekly');
    expect(report.obligations[0].estimatedMonthlyAmount).toBe(216.67);
  });

  it('does not call variable frequent retail spending a recurring obligation', () => {
    const amounts = [20, 145, 61, 290, 34, 175, 89];
    const transactions = amounts.map((amount, index) => (
      spendingTransaction(
        `retail-${index}`,
        'Walmart',
        `2026-07-${String(1 + index * 4).padStart(2, '0')}`,
        amount,
        { normalizedCategory: 'GENERAL_MERCHANDISE' }
      )
    ));

    expect(detectLikelyRecurringObligations(transactions).obligations).toEqual([]);
  });

  it('detects City of Fountain Inn as a variable monthly utility', () => {
    const amounts = [42.18, 97.44, 61.03, 135.27, 54.88];
    const transactions = amounts.map((amount, index) => (
      spendingTransaction(
        `gas-${index}`,
        'City Of Fountain Inn',
        ['2026-04-08', '2026-05-09', '2026-06-08', '2026-07-10', '2026-08-08'][index],
        amount,
        { normalizedCategory: 'GOVERNMENT_AND_NON_PROFIT' }
      )
    ));
    transactions.push(spendingTransaction('latest', 'Grocer', '2026-09-01', 10));

    const result = detectLikelyRecurringObligations(transactions).obligations[0];
    expect(result).toMatchObject({
      merchant: 'City Of Fountain Inn',
      category: 'RENT_AND_UTILITIES',
      cadence: 'monthly',
      amountBehavior: 'variable',
      confidence: 'medium',
      typicalCharge: 61.03,
      estimatedMonthlyAmount: 61.03,
    });
  });

  it('excludes transfers, pending rows, removed rows, and refunds', () => {
    const dates = ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'];
    const transactions = dates.flatMap((date, index) => [
      spendingTransaction(`transfer-${index}`, 'Bank Transfer', date, 100, {
        classification: 'internal_transfer',
        countsTowardSpending: false,
      }),
      spendingTransaction(`pending-${index}`, 'Pending Service', date, 50, { pending: true }),
      spendingTransaction(`removed-${index}`, 'Removed Service', date, 50, { removed: true }),
      spendingTransaction(`refund-${index}`, 'Refund Service', date, 50, {
        classification: 'refund',
        spendingAdjustment: -50,
      }),
    ]);

    expect(detectLikelyRecurringObligations(transactions).obligations).toEqual([]);
  });

  it('does not surface a stale subscription', () => {
    const transactions = [
      spendingTransaction('s1', 'Old Subscription', '2026-01-01', 20),
      spendingTransaction('s2', 'Old Subscription', '2026-02-01', 20),
      spendingTransaction('s3', 'Old Subscription', '2026-03-01', 20),
      spendingTransaction('s4', 'Old Subscription', '2026-04-01', 20),
      spendingTransaction('latest', 'Grocer', '2026-09-01', 10),
    ];

    expect(detectLikelyRecurringObligations(transactions).obligations).toEqual([]);
  });

  it('returns an empty report for missing or invalid transaction dates', () => {
    const invalid = spendingTransaction('invalid', 'Service', 'not-a-date', 10);
    expect(detectLikelyRecurringObligations([])).toEqual({
      obligations: [],
      estimatedMonthlyTotal: 0,
      analyzedThrough: null,
    });
    expect(detectLikelyRecurringObligations([invalid]).analyzedThrough).toBeNull();
  });
});
