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
  
  it('classifies cash withdrawal as non-spending', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-100', catPrimary: 'TRANSFER_OUT', catDetailed: 'TRANSFER_OUT_WITHDRAWAL' }));
    expect(tx.classification).toBe('cash_withdrawal');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
  });
  
  it('classifies outgoing P2P as spending', () => {
    const tx = classifyTransaction(buildRow({ name: 'Venmo to John', cashFlowAmount: '-50', catPrimary: 'TRANSFER_OUT' }));
    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(50);
  });

  it('classifies incoming P2P as not income', () => {
    const tx = classifyTransaction(buildRow({ name: 'Venmo from Jane', cashFlowAmount: '50', catPrimary: 'TRANSFER_IN' }));
    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardIncome).toBe(false);
    expect(tx.countsTowardSpending).toBe(false);
  });

  it('classifies earned interest before generic INCOME', () => {
    const tx = classifyTransaction(buildRow({ catPrimary: 'INCOME', catDetailed: 'INCOME_INTEREST_EARNED', cashFlowAmount: '5' }));
    expect(tx.classification).toBe('interest_earned');
    expect(tx.countsTowardIncome).toBe(true);
    expect(tx.incomeAdjustment).toBe(5);
  });

  it('classifies genuine interest charge as interest_paid', () => {
    const tx = classifyTransaction(buildRow({ catDetailed: 'BANK_FEES_INTEREST_CHARGE', cashFlowAmount: '-10' }));
    expect(tx.classification).toBe('interest_paid');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(10);
  });

  it('classifies ordinary fee as bank_fee not interest_paid', () => {
    const tx = classifyTransaction(buildRow({ catDetailed: 'BANK_FEES_OVERDRAFT_FEE', cashFlowAmount: '-35' }));
    expect(tx.classification).toBe('bank_fee');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(35);
  });

  it('handles removed transaction', () => {
    const tx = classifyTransaction(buildRow({ status: 'removed' }));
    expect(tx.classification).toBe('removed');
  });

  it('handles internal TRANSFER_IN', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '100', catPrimary: 'TRANSFER_IN', catDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }));
    expect(tx.classification).toBe('internal_transfer');
    expect(tx.countsTowardIncome).toBe(false);
  });
  
  it('classifies credit card payment', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-100', catPrimary: 'LOAN_PAYMENTS', catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }));
    expect(tx.classification).toBe('credit_card_payment');
    expect(tx.countsTowardSpending).toBe(false);
  });
});

import { deduplicateAndNormalizeTransactions } from './financial';

describe('Deduplication', () => {
  it('supersedes pending transaction with posted transaction', () => {
    const rawPending = buildRow({ txId: 'pending_1', pending: 'TRUE', cashFlowAmount: '-50' });
    const rawPosted = buildRow({ txId: 'posted_1', pending: 'FALSE', cashFlowAmount: '-50' });
    rawPosted[21] = 'pending_1'; // pendingTransactionId is at index 21
    rawPending[20] = 'TRUE';

    // Must include header row because deduplicateAndNormalizeTransactions ignores it
    const txs = deduplicateAndNormalizeTransactions([
      ['Transaction ID'],
      rawPending,
      rawPosted
    ]);

    expect(txs.length).toBe(2);
    
    const pending = txs.find(t => t.transactionId === 'pending_1');
    const posted = txs.find(t => t.transactionId === 'posted_1');
    
    expect(pending?.classification).toBe('removed');
    expect(pending?.removed).toBe(true);
    expect(pending?.countsTowardSpending).toBe(false);
    expect(pending?.spendingAdjustment).toBe(0);

    expect(posted?.classification).toBe('spending');
    expect(posted?.countsTowardSpending).toBe(true);
    expect(posted?.spendingAdjustment).toBe(50);
  });
});
