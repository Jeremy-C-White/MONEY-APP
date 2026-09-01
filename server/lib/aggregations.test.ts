import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aggregateSummary, aggregateCategories, aggregateTrends, buildVerificationReport } from './aggregations';
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
