import { describe, it, expect } from 'vitest';
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
