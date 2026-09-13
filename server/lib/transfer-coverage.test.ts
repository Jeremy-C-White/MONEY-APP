import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import { analyzeTransferCoverage } from './transfer-coverage';

function transfer(
  transactionId: string,
  accountId: string,
  date: string,
  cashFlowAmount: number
): NormalizedTransaction {
  return {
    transactionId,
    accountId,
    institutionName: 'Bank',
    accountName: accountId,
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    rawDate: date,
    normalizedDate: date,
    name: 'Transfer',
    normalizedMerchant: 'Transfer',
    plaidAmount: -cashFlowAmount,
    cashFlowAmount,
    categoryPrimary: 'TRANSFER_IN',
    categoryDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
    normalizedCategory: 'TRANSFER_IN',
    pending: false,
    pendingTransactionId: '',
    status: 'posted',
    removed: false,
    classification: 'internal_transfer',
    countsTowardSpending: false,
    countsTowardIncome: false,
    spendingAdjustment: 0,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
  };
}

describe('analyzeTransferCoverage', () => {
  it('pairs opposite directions with the same amount across owned accounts', () => {
    const report = analyzeTransferCoverage([
      transfer('out-1', 'checking', '2026-09-01', -500),
      transfer('in-1', 'savings', '2026-09-02', 500),
      transfer('out-2', 'checking', '2026-09-03', -100),
    ]);

    expect(report).toMatchObject({
      totalInternalTransferRows: 3,
      outgoingRows: 2,
      incomingRows: 1,
      matchedPairs: 1,
      unmatchedOutgoingRows: 1,
      outgoingAmount: 600,
      matchedOutgoingAmount: 500,
      readiness: 'strong',
    });
    expect(report.rowCoverage).toBe(0.5);
    expect(report.amountCoverage).toBeCloseTo(5 / 6);
  });

  it('does not invent a destination when equally close matches collide', () => {
    const report = analyzeTransferCoverage([
      transfer('out', 'checking', '2026-09-02', -200),
      transfer('in-a', 'savings-a', '2026-09-01', 200),
      transfer('in-b', 'savings-b', '2026-09-03', 200),
    ]);

    expect(report.matchedPairs).toBe(0);
    expect(report.ambiguousOutgoingRows).toBe(1);
    expect(report.unmatchedOutgoingRows).toBe(0);
    expect(report.readiness).toBe('insufficient');
  });

  it('ignores pending, removed, and non-transfer rows', () => {
    const pending = { ...transfer('pending', 'checking', '2026-09-01', -50), pending: true };
    const removed = { ...transfer('removed', 'checking', '2026-09-01', -50), removed: true };
    const spending = { ...transfer('spend', 'checking', '2026-09-01', -50), classification: 'spending' as const };
    expect(analyzeTransferCoverage([pending, removed, spending])).toMatchObject({
      totalInternalTransferRows: 0,
      rowCoverage: null,
      amountCoverage: null,
      readiness: 'insufficient',
    });
  });
});
