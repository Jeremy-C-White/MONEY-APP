import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';
import { buildHouseholdInsights } from './household-insights';

function transaction(
  overrides: Partial<NormalizedTransaction> & Pick<NormalizedTransaction, 'transactionId' | 'normalizedDate'>
): NormalizedTransaction {
  return {
    transactionId: overrides.transactionId,
    normalizedDate: overrides.normalizedDate,
    accountId: 'account-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    rawDate: overrides.normalizedDate,
    name: 'Purchase',
    normalizedMerchant: 'Merchant',
    plaidAmount: 0,
    cashFlowAmount: -10,
    categoryPrimary: 'GENERAL_MERCHANDISE',
    categoryDetailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
    normalizedCategory: 'GENERAL_MERCHANDISE',
    pending: false,
    pendingTransactionId: '',
    status: 'active',
    removed: false,
    classification: 'spending',
    countsTowardSpending: true,
    countsTowardIncome: false,
    spendingAdjustment: 10,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
    ...overrides,
  };
}

function obligation(
  overrides: Partial<ReviewedRecurringObligation> & Pick<ReviewedRecurringObligation, 'obligationId' | 'merchant'>
): ReviewedRecurringObligation {
  return {
    obligationId: overrides.obligationId,
    merchant: overrides.merchant,
    category: 'RENT_AND_UTILITIES',
    cadence: 'monthly',
    confidence: 'high',
    typicalCharge: 120,
    estimatedMonthlyAmount: 120,
    occurrenceCount: 6,
    lastChargeDate: '2026-08-15',
    status: 'confirmed',
    expectedMonthlyAmount: 120,
    seasonStartMonth: null,
    seasonEndMonth: null,
    note: null,
    detected: true,
    ...overrides,
  };
}

describe('buildHouseholdInsights', () => {
  it('compares Monday-to-date with the same days and the full previous week', () => {
    const result = buildHouseholdInsights([
      transaction({ transactionId: 'current-mon', normalizedDate: '2026-09-07', spendingAdjustment: 100 }),
      transaction({ transactionId: 'current-wed', normalizedDate: '2026-09-09', spendingAdjustment: 50 }),
      transaction({ transactionId: 'previous-mon', normalizedDate: '2026-08-31', spendingAdjustment: 80 }),
      transaction({ transactionId: 'previous-wed', normalizedDate: '2026-09-02', spendingAdjustment: 20 }),
      transaction({ transactionId: 'previous-fri', normalizedDate: '2026-09-04', spendingAdjustment: 30 }),
    ], [], '2026-09-09');

    expect(result.weekly.current).toMatchObject({
      startDate: '2026-09-07',
      endDate: '2026-09-09',
      spending: 150,
    });
    expect(result.weekly.previousComparable).toMatchObject({
      startDate: '2026-08-31',
      endDate: '2026-09-02',
      spending: 100,
    });
    expect(result.weekly.previousFull.spending).toBe(130);
    expect(result.weekly.spendingDifference).toBe(50);
    expect(result.weekly.spendingPercentageChange).toBe(50);
  });

  it('uses recognized adjustments and excludes pending, removed, and transfer rows from posted totals', () => {
    const result = buildHouseholdInsights([
      transaction({ transactionId: 'spend', normalizedDate: '2026-09-08', spendingAdjustment: 25.5 }),
      transaction({
        transactionId: 'income',
        normalizedDate: '2026-09-08',
        classification: 'income',
        countsTowardSpending: false,
        countsTowardIncome: true,
        spendingAdjustment: 0,
        incomeAdjustment: 100,
      }),
      transaction({ transactionId: 'pending', normalizedDate: '2026-09-09', pending: true, spendingAdjustment: 15 }),
      transaction({ transactionId: 'removed', normalizedDate: '2026-09-09', removed: true, spendingAdjustment: 50 }),
      transaction({
        transactionId: 'transfer',
        normalizedDate: '2026-09-09',
        classification: 'internal_transfer',
        countsTowardSpending: false,
        spendingAdjustment: 0,
      }),
    ], [], '2026-09-09');

    expect(result.weekly.current.spending).toBe(25.5);
    expect(result.weekly.current.income).toBe(100);
    expect(result.weekly.current.netCashFlow).toBe(74.5);
    expect(result.weekly.pendingSpending).toBe(15);
  });

  it('compares March 31 with all 28 days of the preceding February', () => {
    const result = buildHouseholdInsights([
      transaction({ transactionId: 'feb-28', normalizedDate: '2026-02-28', spendingAdjustment: 200 }),
      transaction({ transactionId: 'mar-31', normalizedDate: '2026-03-31', spendingAdjustment: 250 }),
    ], [], '2026-03-31');

    expect(result.monthly.previousComparable.endDate).toBe('2026-02-28');
    expect(result.monthly.previousComparable.spending).toBe(200);
    expect(result.monthly.current.spending).toBe(250);
  });

  it('surfaces the largest category changes using existing category adjustment semantics', () => {
    const result = buildHouseholdInsights([
      transaction({
        transactionId: 'food-current',
        normalizedDate: '2026-09-02',
        normalizedCategory: 'FOOD_AND_DRINK',
        spendingAdjustment: 300,
      }),
      transaction({
        transactionId: 'food-refund',
        normalizedDate: '2026-09-03',
        normalizedCategory: 'TRANSFER_IN',
        classification: 'refund',
        spendingAdjustment: -50,
        overrideOffsetCategory: 'FOOD_AND_DRINK',
      }),
      transaction({
        transactionId: 'food-previous',
        normalizedDate: '2026-08-02',
        normalizedCategory: 'FOOD_AND_DRINK',
        spendingAdjustment: 100,
      }),
      transaction({
        transactionId: 'utilities-current',
        normalizedDate: '2026-09-04',
        normalizedCategory: 'RENT_AND_UTILITIES',
        spendingAdjustment: 50,
      }),
      transaction({
        transactionId: 'utilities-previous',
        normalizedDate: '2026-08-04',
        normalizedCategory: 'RENT_AND_UTILITIES',
        spendingAdjustment: 200,
      }),
    ], [], '2026-09-05');

    expect(result.monthly.categoryChanges).toEqual([
      {
        category: 'FOOD_AND_DRINK',
        currentSpending: 250,
        previousSpending: 100,
        difference: 150,
        percentageChange: 150,
      },
      {
        category: 'RENT_AND_UTILITIES',
        currentSpending: 50,
        previousSpending: 200,
        difference: -150,
        percentageChange: -75,
      },
    ]);
  });

  it('adds pending and unpaid confirmed obligations once while projecting variable spending', () => {
    const result = buildHouseholdInsights([
      transaction({
        transactionId: 'verizon-paid',
        normalizedDate: '2026-09-05',
        normalizedMerchant: 'Verizon',
        normalizedCategory: 'RENT_AND_UTILITIES',
        spendingAdjustment: 120,
      }),
      transaction({
        transactionId: 'lawn-paid',
        normalizedDate: '2026-09-07',
        normalizedMerchant: 'Lawnstarter',
        normalizedCategory: 'HOME_IMPROVEMENT',
        spendingAdjustment: 70,
      }),
      transaction({
        transactionId: 'lawn-pending',
        normalizedDate: '2026-09-10',
        normalizedMerchant: 'Lawnstarter',
        normalizedCategory: 'HOME_IMPROVEMENT',
        pending: true,
        spendingAdjustment: 70,
      }),
      transaction({
        transactionId: 'groceries',
        normalizedDate: '2026-09-08',
        normalizedMerchant: 'Grocery Store',
        normalizedCategory: 'FOOD_AND_DRINK',
        spendingAdjustment: 300,
      }),
    ], [
      obligation({ obligationId: 'verizon', merchant: 'Verizon', expectedMonthlyAmount: 120 }),
      obligation({ obligationId: 'lawn', merchant: 'Lawnstarter', expectedMonthlyAmount: 300, cadence: 'weekly' }),
      obligation({ obligationId: 'suggested', merchant: 'Grocery Store', status: 'suggested', expectedMonthlyAmount: 999 }),
      obligation({
        obligationId: 'winter',
        merchant: 'Winter Service',
        status: 'seasonal',
        seasonStartMonth: 11,
        seasonEndMonth: 2,
        expectedMonthlyAmount: 500,
      }),
    ], '2026-09-10');

    expect(result.forecast).toMatchObject({
      daysElapsed: 10,
      daysRemaining: 20,
      maturity: 'developing',
      postedSpending: 490,
      pendingSpending: 70,
      confirmedRecurringMonthly: 420,
      confirmedRecurringRemaining: 160,
      variableSpendingToDate: 300,
      projectedVariableRemaining: 600,
      projectedMonthEndSpending: 1320,
    });
  });

  it('rejects invalid civil dates instead of silently rolling them into another month', () => {
    expect(() => buildHouseholdInsights([], [], '2026-02-30')).toThrow(
      'asOfDate must be a valid YYYY-MM-DD civil date.'
    );
  });
});
