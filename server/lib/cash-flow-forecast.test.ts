import { describe, expect, it } from 'vitest';
import type { AccountBalanceRecord, AccountBalanceSummary } from './account-balances';
import type { NormalizedTransaction } from './financial';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';
import { buildCashFlowForecast } from './cash-flow-forecast';

function transaction(
  overrides: Partial<NormalizedTransaction> & Pick<NormalizedTransaction, 'transactionId' | 'normalizedDate'>
): NormalizedTransaction {
  return {
    transactionId: overrides.transactionId,
    normalizedDate: overrides.normalizedDate,
    accountId: 'checking-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    rawDate: overrides.normalizedDate,
    name: 'Purchase',
    normalizedMerchant: 'Merchant',
    plaidAmount: 10,
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

function payroll(
  transactionId: string,
  normalizedDate: string,
  identity: string,
  amount: number
): NormalizedTransaction {
  return transaction({
    transactionId,
    normalizedDate,
    name: `VERIZON V3 DIR DEP 260101 ${identity} WHITE`,
    normalizedMerchant: 'Verizon',
    cashFlowAmount: amount,
    plaidAmount: -amount,
    categoryPrimary: 'INCOME',
    categoryDetailed: 'INCOME_SALARY',
    normalizedCategory: 'INCOME',
    classification: 'income',
    countsTowardSpending: false,
    countsTowardIncome: true,
    spendingAdjustment: 0,
    incomeAdjustment: amount,
  });
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
    typicalCharge: 100,
    estimatedMonthlyAmount: 100,
    occurrenceCount: 6,
    lastChargeDate: '2026-08-15',
    status: 'confirmed',
    expectedMonthlyAmount: 100,
    seasonStartMonth: null,
    seasonEndMonth: null,
    note: null,
    detected: true,
    ...overrides,
  };
}

function account(overrides: Partial<AccountBalanceRecord> = {}): AccountBalanceRecord {
  return {
    accountId: 'checking-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    current: 2100,
    available: 2000,
    limit: null,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    health: 'healthy',
    fetchedAt: '2026-09-04T12:00:00.000Z',
    balanceStatus: 'fresh',
    ...overrides,
  };
}

function balances(accounts: AccountBalanceRecord[] = [account()]): AccountBalanceSummary {
  return {
    status: 'complete',
    currency: 'USD',
    oldestFetchedAt: '2026-09-04T12:00:00.000Z',
    newestFetchedAt: '2026-09-04T12:00:00.000Z',
    connectedItemCount: 1,
    reportingItemCount: 1,
    freshItemCount: 1,
    missingCurrentBalanceCount: 0,
    currencyIssueCount: 0,
    cashCurrent: 2100,
    cashAvailable: 2000,
    creditBalance: null,
    creditOwed: null,
    creditCredits: null,
    loanBalance: null,
    investmentValue: null,
    connectedPosition: 2100,
    issues: [],
    accounts,
  };
}

const payDates = ['2026-07-03', '2026-07-17', '2026-07-31', '2026-08-14', '2026-08-28'];

describe('buildCashFlowForecast', () => {
  it('detects the two regular Verizon payroll streams while excluding unrelated inflows and a bonus', () => {
    const transactions = [
      ...payDates.flatMap((date, index) => [
        payroll(`charlotte-${index}`, date, 'SC2439134', 2800 + index * 5),
        payroll(`jeremy-${index}`, date, 'SC524074', 3000 + index * 5),
      ]),
      payroll('bonus', '2026-08-21', 'SC524074', 15000),
      transaction({
        transactionId: 'paypal-load',
        normalizedDate: '2026-08-29',
        accountId: 'paypal-1',
        accountSubtype: 'paypal',
        name: 'Payment from VERIZON V3 | DIR DEP',
        cashFlowAmount: 300,
        classification: 'internal_transfer',
        countsTowardSpending: false,
        spendingAdjustment: 0,
      }),
      transaction({
        transactionId: 'zelle',
        normalizedDate: '2026-09-01',
        name: 'Zelle from AUTOSHOPARTS LLC',
        cashFlowAmount: 700,
        classification: 'person_to_person',
        countsTowardSpending: false,
        spendingAdjustment: 0,
      }),
    ];

    const result = buildCashFlowForecast({
      transactions,
      recurringObligations: [],
      accountBalances: balances(),
      asOfDate: '2026-09-04',
    });

    expect(result.status).toBe('ready');
    expect(result.paycheckStreams).toHaveLength(2);
    expect(result.paycheckStreams.map(stream => stream.typicalAmount)).toEqual([2810, 3010]);
    expect(result.paycheckStreams.every(stream => stream.nextDate === '2026-09-11')).toBe(true);
    expect(result.scheduledEvents.filter(event => event.kind === 'paycheck')).toHaveLength(4);
    expect(result.dailyBalances.at(-1)?.balance).toBe(13640);
  });

  it('shows confirmed upcoming bills and subtracts only those that directly hit payroll checking', () => {
    const internetHistory = transaction({
      transactionId: 'internet-history',
      normalizedDate: '2026-08-31',
      normalizedMerchant: 'Internet Co',
      name: 'Internet Co',
      accountId: 'checking-1',
    });
    const streamingHistory = transaction({
      transactionId: 'streaming-history',
      normalizedDate: '2026-08-31',
      normalizedMerchant: 'Streaming Co',
      name: 'Streaming Co',
      accountId: 'credit-1',
      accountType: 'credit',
      accountSubtype: 'credit card',
    });
    const transactions = [
      ...payDates.map((date, index) => payroll(`pay-${index}`, date, 'SC2439134', 2800)),
      internetHistory,
      streamingHistory,
    ];
    const result = buildCashFlowForecast({
      transactions,
      recurringObligations: [
        obligation({
          obligationId: 'internet',
          merchant: 'Internet Co',
          cadence: 'weekly',
          lastChargeDate: '2026-08-31',
          expectedMonthlyAmount: 433.33,
        }),
        obligation({
          obligationId: 'streaming',
          merchant: 'Streaming Co',
          cadence: 'weekly',
          lastChargeDate: '2026-08-31',
          expectedMonthlyAmount: 86.67,
        }),
        obligation({ obligationId: 'suggested', merchant: 'Suggested Co', status: 'suggested' }),
        obligation({ obligationId: 'dismissed', merchant: 'Dismissed Co', status: 'dismissed' }),
      ],
      accountBalances: balances([
        account(),
        account({
          accountId: 'credit-1',
          accountName: 'Rewards Card',
          accountMask: '9876',
          accountType: 'credit',
          accountSubtype: 'credit card',
          current: 500,
          available: 4500,
        }),
      ]),
      asOfDate: '2026-09-04',
      horizonDays: 7,
    });

    expect(result.upcomingBills.map(event => event.label)).toEqual(['Internet Co', 'Streaming Co']);
    expect(result.upcomingBills.find(event => event.label === 'Internet Co')).toMatchObject({
      date: '2026-09-07',
      amount: 100,
      affectsForecastBalance: true,
    });
    expect(result.upcomingBills.find(event => event.label === 'Streaming Co')).toMatchObject({
      amount: 20,
      affectsForecastBalance: false,
      accountName: 'Rewards Card ••••9876',
    });
    expect(result.dailyBalances.at(-1)?.balance).toBe(4700);
  });

  it('suppresses a predicted bill already represented by a pending transaction', () => {
    const history = transaction({
      transactionId: 'bill-history',
      normalizedDate: '2026-08-31',
      normalizedMerchant: 'Internet Co',
    });
    const pending = transaction({
      transactionId: 'bill-pending',
      normalizedDate: '2026-09-06',
      normalizedMerchant: 'Internet Co',
      pending: true,
    });
    const result = buildCashFlowForecast({
      transactions: [
        ...payDates.map((date, index) => payroll(`pay-${index}`, date, 'SC2439134', 2800)),
        history,
        pending,
      ],
      recurringObligations: [obligation({
        obligationId: 'internet',
        merchant: 'Internet Co',
        cadence: 'weekly',
        lastChargeDate: '2026-08-31',
        expectedMonthlyAmount: 433.33,
      })],
      accountBalances: balances(),
      asOfDate: '2026-09-04',
      horizonDays: 7,
    });

    expect(result.upcomingBills).toEqual([]);
    expect(result.dailyBalances.at(-1)?.balance).toBe(4800);
  });

  it('keeps monthly bills anchored to the original day after a short month', () => {
    const result = buildCashFlowForecast({
      transactions: [transaction({
        transactionId: 'month-end-history',
        normalizedDate: '2026-01-31',
        normalizedMerchant: 'Month End Service',
      })],
      recurringObligations: [obligation({
        obligationId: 'month-end',
        merchant: 'Month End Service',
        lastChargeDate: '2026-01-31',
      })],
      accountBalances: balances(),
      asOfDate: '2026-02-01',
      horizonDays: 60,
    });

    expect(result.scheduledEvents.map(event => event.date)).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('refuses to draw a balance line from stale balance data', () => {
    const result = buildCashFlowForecast({
      transactions: payDates.map((date, index) => payroll(`pay-${index}`, date, 'SC2439134', 2800)),
      recurringObligations: [],
      accountBalances: balances([account({ balanceStatus: 'stale' })]),
      asOfDate: '2026-09-04',
    });

    expect(result.status).toBe('stale');
    expect(result.dailyBalances).toEqual([]);
    expect(result.warning).toContain('fresh successful sync');
  });
});
