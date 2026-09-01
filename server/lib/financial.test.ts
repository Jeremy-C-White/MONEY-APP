import { describe, it, expect } from 'vitest';
import { classifyTransaction, NormalizedTransaction } from './financial';

function buildRow(overrides: Record<string, string>): any[] {
  const row: any[] = new Array(25).fill('');
  // 0: transaction_id
  row[0] = overrides.txId || 'tx1';
  // 10: name
  row[10] = overrides.name || 'Test Merchant';
  // 11: merchant_name
  row[11] = overrides.merchantName || '';
  // 13: plaid amount
  row[13] = overrides.plaidAmount || '0';
  // 14: cash flow amount
  row[14] = overrides.cashFlowAmount || '0';
  // 16: cat primary
  row[16] = overrides.catPrimary || 'GENERAL_MERCHANDISE';
  // 17: cat detailed
  row[17] = overrides.catDetailed || 'GENERAL_MERCHANDISE_SUPERSTORES';
  // 20: pending
  row[20] = overrides.pending || 'FALSE';
  // 22: status
  row[22] = overrides.status || 'posted';
  
  return row;
}

describe('Financial Rules Pass 1B', () => {
  it('classifies $50 purchase', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-50', plaidAmount: '50' }));
    expect(tx.classification).toBe('spending');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(50); // Positive spending
  });

  it('classifies recognized $30 merchant refund', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '30', plaidAmount: '-30', catDetailed: 'GENERAL_MERCHANDISE_REFUND' }));
    expect(tx.classification).toBe('refund');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(-30);
  });
  
  it('does not classify positive inflow as refund without evidence', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '200', plaidAmount: '-200', catPrimary: 'GENERAL_MERCHANDISE', catDetailed: 'GENERAL_MERCHANDISE' }));
    expect(tx.classification).toBe('other');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.spendingAdjustment).toBe(0);
  });

  it('classifies internal transfer out', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-100', catPrimary: 'TRANSFER_OUT', catDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER' }));
    expect(tx.classification).toBe('internal_transfer');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
  });
  
  it('classifies cash withdrawal', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-100', catPrimary: 'TRANSFER_OUT', catDetailed: 'TRANSFER_OUT_WITHDRAWAL' }));
    expect(tx.classification).toBe('cash_withdrawal');
    expect(tx.spendingAdjustment).toBe(100);
  });
  
  it('classifies credit card payment', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-100', catPrimary: 'LOAN_PAYMENTS', catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }));
    expect(tx.classification).toBe('credit_card_payment');
    expect(tx.countsTowardSpending).toBe(false);
  });
});
