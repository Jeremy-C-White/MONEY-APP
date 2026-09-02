import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aggregateSummary, aggregateCategories, aggregateTrends, buildVerificationReport, buildAccountHealthMap, filterTransactions } from './aggregations';
import { NormalizedTransaction } from './financial';

function mockTx(overrides: Partial<NormalizedTransaction>): NormalizedTransaction {
  return {
    transactionId: 't1', accountId: 'a1', institutionName: 'I', accountName: 'A', accountMask: '1234',
    accountType: 'depository', accountSubtype: 'checking', rawDate: '45000', normalizedDate: '2026-08-15',
    name: 'T', normalizedMerchant: 'T', plaidAmount: 0, cashFlowAmount: 0,
    categoryPrimary: '', categoryDetailed: '', normalizedCategory: 'C',
    pending: false, pendingTransactionId: '', status: 'posted', removed: false,
    classification: 'other', countsTowardSpending: false, countsTowardIncome: false,
    spendingAdjustment: 0, incomeAdjustment: 0,
    ...overrides
  };
}

describe('Aggregations Pass 1B', () => {
  it('$50 purchase -> dashboard spending 50', () => {
    const res = aggregateSummary([
      mockTx({ classification: 'spending', countsTowardSpending: true, spendingAdjustment: 50 })
    ], 'America/New_York');
    expect(res.allTime.spending).toBe(50);
  });

  it('$1000 income + $50 purchase -> net cash flow 950', () => {
    const res = aggregateSummary([
      mockTx({ classification: 'income', countsTowardIncome: true, incomeAdjustment: 1000 }),
      mockTx({ classification: 'spending', countsTowardSpending: true, spendingAdjustment: 50 })
    ], 'America/New_York');
    expect(res.allTime.netCashFlow).toBe(950);
  });

  it('$100 purchase + $30 refund -> net spending 70', () => {
    const res = aggregateSummary([
      mockTx({ classification: 'spending', countsTowardSpending: true, spendingAdjustment: 100 }),
      mockTx({ classification: 'refund', countsTowardSpending: true, spendingAdjustment: -30 })
    ], 'America/New_York');
    expect(res.allTime.spending).toBe(70);
  });
  
  it('$100 purchase + $100 cc payment -> spending 100', () => {
    const res = aggregateSummary([
      mockTx({ classification: 'spending', countsTowardSpending: true, spendingAdjustment: 100 }),
      mockTx({ classification: 'credit_card_payment', countsTowardSpending: false })
    ], 'America/New_York');
    expect(res.allTime.spending).toBe(100);
  });
  
  it('pending purchase separates from posted', () => {
    const res = aggregateSummary([
      mockTx({ classification: 'spending', countsTowardSpending: true, spendingAdjustment: 100 }), // posted
      mockTx({ classification: 'spending', countsTowardSpending: true, spendingAdjustment: 25, pending: true }) // pending
    ], 'America/New_York');
    expect(res.allTime.spending).toBe(100);
    expect(res.allTime.pendingSpending).toBe(25);
    expect(res.allTime.projectedSpending).toBe(125);
  });
  
  it('category percentages', () => {
    const res = aggregateCategories([
      mockTx({ normalizedCategory: 'Food', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 100 }),
      mockTx({ normalizedCategory: 'Shopping', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 50 })
    ]);
    expect(res.find(c => c.category === 'Food')?.percentage).toBeCloseTo(0.6666);
    expect(res.find(c => c.category === 'Shopping')?.percentage).toBeCloseTo(0.3333);
  });
});

import { getPreviousMonthString } from './aggregations';
import { deduplicateAndNormalizeTransactions } from './financial';

describe('Aggregations Pass 1C', () => {
  it('cash withdrawal report', () => {
    const res = buildVerificationReport([
      mockTx({ classification: 'cash_withdrawal', cashFlowAmount: -100, spendingAdjustment: 0, countsTowardSpending: false })
    ], 'America/New_York');
    expect(res.reconciliation.cashWithdrawalCount).toBe(1);
    expect(res.reconciliation.cashWithdrawalAmount).toBe(100);
    expect(res.summary.allTime.spending).toBe(0);
  });

  it('pending -> posted deduplication + summary', () => {
    // Actually, deduplicateAndNormalizeTransactions expects raw rows.
    // Let us mock the output of deduplicate directly.
    const deduped = [
      mockTx({ transactionId: 'posted_1', pending: false, classification: 'spending', spendingAdjustment: 50, countsTowardSpending: true }),
      mockTx({ transactionId: 'pending_1', pending: true, classification: 'removed', removed: true, spendingAdjustment: 0, countsTowardSpending: false })
    ];
    const res = aggregateSummary(deduped, 'America/New_York');
    expect(res.allTime.spending).toBe(50);
    expect(res.allTime.pendingSpending).toBe(0);
    expect(res.allTime.projectedSpending).toBe(50);
  });

  it('reports investment transfers outside Needs Review and preserves the accounting bridge', () => {
    const res = buildVerificationReport([
      mockTx({
        classification: 'investment_transfer',
        cashFlowAmount: -500,
        categoryPrimary: 'TRANSFER_OUT',
        categoryDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS'
      }),
      mockTx({
        transactionId: 'review_1',
        classification: 'other',
        cashFlowAmount: 100,
        categoryPrimary: 'TRANSFER_IN'
      })
    ], 'America/New_York');

    expect(res.reconciliation.investmentTransferCount).toBe(1);
    expect(res.reconciliation.investmentTransferAmount).toBe(500);
    expect(res.reconciliation.unknownTransferCount).toBe(1);
    expect(res.reconciliation.unknownTransferAmount).toBe(100);
    expect(res.reconciliation.bridge.investmentTransfers).toBe(-500);
    expect(res.reconciliation.bridge.accountingBridgeReconciles).toBe(true);
    expect(res.summary.allTime.spending).toBe(0);
    expect(res.summary.allTime.income).toBe(0);
  });
});

describe('Trend Ranges and Boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('6m trend returns exactly 6 months', () => {
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    const txs = [
      mockTx({ normalizedDate: '2026-08-10', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 10 }),
      mockTx({ normalizedDate: '2026-02-10', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 10 }),
      mockTx({ normalizedDate: '2026-01-10', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 10 }) // Outside 6m (Mar-Aug)
    ];
    const trends = aggregateTrends(txs, '6m', 'America/New_York');
    expect(trends.length).toBe(6);
    expect(trends[0].month).toBe('2026-03');
    expect(trends[5].month).toBe('2026-08');
  });

  it('12m trend returns exactly 12 months', () => {
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    const txs = [
      mockTx({ normalizedDate: '2025-08-10', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 10 }) // Outside 12m (Sep-Aug)
    ];
    const trends = aggregateTrends(txs, '12m', 'America/New_York');
    expect(trends.length).toBe(12);
    expect(trends[0].month).toBe('2025-09');
    expect(trends[11].month).toBe('2026-08');
  });

  it('ytd trend starts at January', () => {
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    const txs = [];
    const trends = aggregateTrends(txs, 'ytd', 'America/New_York');
    expect(trends.length).toBe(8);
    expect(trends[0].month).toBe('2026-01');
    expect(trends[7].month).toBe('2026-08');
  });

  it('America/New_York month boundary', () => {
    // 2026-08-01T02:00:00Z is Aug 1 02:00 UTC, which is Jul 31 22:00 in New York
    vi.setSystemTime(new Date('2026-08-01T02:00:00Z'));
    const trends = aggregateTrends([], 'ytd', 'America/New_York');
    // Current month should be July (07)
    expect(trends[trends.length - 1].month).toBe('2026-07');
  });
});
describe('Month-to-date pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mid-month: paced comparison uses only the matching previous-month days', () => {
    vi.setSystemTime(new Date('2026-07-10T16:00:00Z')); // July 10, noon ET (day 10 of a 31-day month)
    const txs: NormalizedTransaction[] = [];
    for (let day = 1; day <= 10; day++) {
      txs.push(mockTx({ normalizedDate: `2026-07-${String(day).padStart(2, '0')}`, classification: 'spending', countsTowardSpending: true, spendingAdjustment: 10 }));
    }
    for (let day = 1; day <= 30; day++) {
      txs.push(mockTx({ normalizedDate: `2026-06-${String(day).padStart(2, '0')}`, classification: 'spending', countsTowardSpending: true, spendingAdjustment: 10 }));
    }

    const res = aggregateSummary(txs, 'America/New_York');

    expect(res.previousMonth.spending).toBe(300); // full previous month, unpaced, unchanged
    expect(res.pacing.dayOfMonth).toBe(10);
    expect(res.pacing.previousMonthToDateSpending).toBe(100); // only June 1-10
    expect(res.pacing.spendingDifference).toBe(0);
    expect(res.pacing.spendingPercentageChange).toBe(0);
  });

  it('day 1: paced comparison uses only previous-month day 1', () => {
    vi.setSystemTime(new Date('2026-08-01T16:00:00Z')); // Aug 1, noon ET
    const txs = [
      mockTx({ normalizedDate: '2026-07-01', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 20 }),
      mockTx({ normalizedDate: '2026-07-02', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 999 }),
      mockTx({ normalizedDate: '2026-08-01', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 15 }),
    ];

    const res = aggregateSummary(txs, 'America/New_York');

    expect(res.pacing.dayOfMonth).toBe(1);
    expect(res.pacing.previousMonthToDateSpending).toBe(20);
    expect(res.pacing.spendingDifference).toBe(-5);
    expect(res.pacing.spendingPercentageChange).toBe(-25);
  });

  it('previous month shorter than current: does not throw or produce NaN', () => {
    vi.setSystemTime(new Date('2026-07-31T16:00:00Z')); // July 31 (31-day month), noon ET
    const txs = [
      mockTx({ normalizedDate: '2026-06-15', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 30 }),
      mockTx({ normalizedDate: '2026-06-30', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 50 }), // June has no day 31
      mockTx({ normalizedDate: '2026-07-31', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 40 }),
    ];

    const res = aggregateSummary(txs, 'America/New_York');

    expect(res.pacing.dayOfMonth).toBe(31);
    expect(res.pacing.daysInMonth).toBe(31);
    expect(res.pacing.previousMonthToDateSpending).toBe(80); // all of June counts: 30 <= 31
    expect(res.pacing.spendingDifference).toBe(-40);
    expect(res.pacing.spendingPercentageChange).toBe(-50);
    expect(Number.isNaN(res.pacing.spendingPercentageChange as number)).toBe(false);
    expect(Number.isFinite(res.pacing.projectedMonthEndSpending)).toBe(true);
  });

  it('previous-month-to-date is zero: percentage change is null, not 0 or Infinity', () => {
    vi.setSystemTime(new Date('2026-08-05T16:00:00Z')); // Aug 5, noon ET
    const txs = [
      mockTx({ normalizedDate: '2026-08-05', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 25 }),
    ];

    const res = aggregateSummary(txs, 'America/New_York');

    expect(res.pacing.previousMonthToDateSpending).toBe(0);
    expect(res.pacing.spendingPercentageChange).toBeNull();
    expect(res.pacing.spendingDifference).toBe(25);
  });

  it('projection: 10 days elapsed, $1,000 spent, 30-day month -> projected 3000', () => {
    vi.setSystemTime(new Date('2026-09-10T16:00:00Z')); // Sept 10 (30-day month), noon ET
    const txs = [
      mockTx({ normalizedDate: '2026-09-10', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 1000 }),
    ];

    const res = aggregateSummary(txs, 'America/New_York');

    expect(res.pacing.dayOfMonth).toBe(10);
    expect(res.pacing.daysInMonth).toBe(30);
    expect(res.pacing.projectedMonthEndSpending).toBe(3000);
  });

  it('leaves currentMonth, previousMonth, and allTime fields unchanged', () => {
    vi.setSystemTime(new Date('2026-08-15T16:00:00Z')); // Aug 15, noon ET
    const txs = [
      mockTx({ normalizedDate: '2026-08-05', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 200 }),
      mockTx({ normalizedDate: '2026-07-05', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 150 }),
      mockTx({ normalizedDate: '2026-07-25', classification: 'spending', countsTowardSpending: true, spendingAdjustment: 50 }), // after day 15: in previousMonth, excluded from pacing
    ];

    const res = aggregateSummary(txs, 'America/New_York');

    expect(res.currentMonth.spending).toBe(200);
    expect(res.previousMonth.spending).toBe(200); // full month: 150 + 50, unpaced
    expect(res.allTime.spending).toBe(400);
    expect(res.comparison.spendingDifference).toBe(0); // unpaced: 200 - 200
    expect(res.comparison.spendingPercentageChange).toBe(0);

    // pacing genuinely differs from the unpaced comparison above
    expect(res.pacing.previousMonthToDateSpending).toBe(150); // only July 5 (<=15)
    expect(res.pacing.spendingDifference).toBe(50); // 200 - 150
  });
});

describe('Account Health Mapping', () => {
  it('maps account health securely by account id, isolating same-institution health drift', () => {
    const plaidItems = [
      {
        health: 'good',
        accounts: [{ id: 'acc_1', name: 'Checking' }]
      },
      {
        health: 'login_required',
        accounts: [{ id: 'acc_2', name: 'Savings' }]
      }
    ];
    
    const healthMap = buildAccountHealthMap(plaidItems);
    expect(healthMap.get('acc_1')).toBe('good');
    expect(healthMap.get('acc_2')).toBe('login_required');
  });
});

describe('Aggregations Semantic Income Prevention', () => {
  it('prevents semantic income from inflating spending despite raw category', () => {
    // Mimic the exact outcome of classifyTransaction for a payroll masquerading as FOOD_AND_DRINK
    const tx = mockTx({
      classification: 'income',
      countsTowardIncome: true,
      incomeAdjustment: 810,
      countsTowardSpending: false,
      spendingAdjustment: 0,
      categoryPrimary: 'FOOD_AND_DRINK',
      normalizedCategory: 'INCOME',
      normalizedMerchant: 'Sweetgreen inc payroll'
    });
    
    const summary = aggregateSummary([tx], 'America/New_York');
    expect(summary.allTime.income).toBe(810);
    expect(summary.allTime.spending).toBe(0); // MUST NOT inflate spending
    
    const categories = aggregateCategories([tx]);
    // The transaction should not be in the spending category list
    const foodAndDrink = categories.find(c => c.category === 'FOOD_AND_DRINK');
    expect(foodAndDrink).toBeUndefined(); // or its amount is 0 if your aggregator works differently
    const incomeCat = categories.find(c => c.category === 'INCOME');
    expect(incomeCat).toBeUndefined(); // Assuming aggregateCategories only tracks spending
  });
});

describe('filterTransactions', () => {
  it('pending status filter returns active pending and excludes removed pending', () => {
    const txs = [
      mockTx({ transactionId: 't1', pending: true, removed: false }),
      mockTx({ transactionId: 't2', pending: true, removed: true }),
      mockTx({ transactionId: 't3', pending: false, removed: false })
    ];
    
    const result = filterTransactions(txs, { status: 'pending' });
    expect(result.length).toBe(1);
    expect(result[0].transactionId).toBe('t1');
  });
});
