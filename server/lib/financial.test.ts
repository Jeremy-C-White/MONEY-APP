import { describe, it, expect } from 'vitest';
import { classifyTransaction, deduplicateAndNormalizeTransactions } from './financial';

function buildRow(overrides: Record<string, string>): any[] {
  const row = new Array(24).fill('');
  row[0] = overrides.txId || 'test_tx';
  row[1] = 'acc_1';
  row[6] = overrides.accountType || 'depository';
  row[7] = overrides.accountSubtype || 'checking';
  row[8] = '45000'; // Date
  row[10] = overrides.name || 'Test Merchant';
  row[11] = overrides.merchantName || overrides.name || 'Test Merchant';
  row[13] = overrides.plaidAmount || '0';
  row[14] = overrides.cashFlowAmount || '-50';
  row[16] = overrides.catPrimary || 'FOOD_AND_DRINK';
  row[17] = overrides.catDetailed || 'FOOD_AND_DRINK_RESTAURANT';
  row[20] = overrides.pending || 'FALSE';
  row[21] = overrides.pendingTransactionId || '';
  row[22] = overrides.status || 'posted';
  return row;
}

describe('Financial Rules Pass 1B', () => {
  it('classifies $50 purchase', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '-50' }));
    expect(tx.classification).toBe('spending');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(50);
    expect(tx.countsTowardIncome).toBe(false);
  });
  
  it('classifies recognized $30 merchant refund', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '30', name: 'TARGET REFUND' }));
    expect(tx.classification).toBe('refund');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(-30);
    expect(tx.countsTowardIncome).toBe(false);
  });
  
  it('does not classify positive inflow as refund without evidence', () => {
    const tx = classifyTransaction(buildRow({ cashFlowAmount: '30', name: 'SOME RANDOM DEPOSIT' }));
    expect(tx.classification).toBe('other');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
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

describe('New Reconciliation Tests', () => {
  it('LOAN_PAYMENTS + credit-card account + automatic-payment description -> credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'LOAN_PAYMENTS', 
      accountType: 'credit', 
      name: 'AUTOMATIC PAYMENT - THANK', 
      cashFlowAmount: '-500' 
    }));
    expect(tx.classification).toBe('credit_card_payment');
  });

  it('ordinary loan payment that is not a credit-card payment -> must NOT automatically become credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'LOAN_PAYMENTS', 
      catDetailed: 'LOAN_PAYMENTS_STUDENT_LOAN', 
      accountType: 'depository', 
      name: 'NAVIENT PAYMENT', 
      cashFlowAmount: '-200' 
    }));
    expect(tx.classification).toBe('spending'); // Assuming generic negative becomes spending
  });

  it('INTRST PYMNT savings credit -> interest_earned', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'TRANSFER_IN', 
      accountType: 'depository', 
      accountSubtype: 'savings', 
      name: 'INTRST PYMNT', 
      cashFlowAmount: '4.22' 
    }));
    expect(tx.classification).toBe('interest_earned');
  });

  it('generic TRANSFER_IN -> still internal_transfer/other according to existing rules', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'TRANSFER_IN', 
      accountType: 'depository', 
      name: 'UNKNOWN DEPOSIT', 
      cashFlowAmount: '100' 
    }));
    expect(tx.classification).toBe('other');
  });

  it('TRANSFER_OUT_ACCOUNT_TRANSFER + "Venmo payment" -> person_to_person -> spending', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'TRANSFER_OUT', 
      catDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER', 
      name: 'Venmo payment', 
      cashFlowAmount: '-50' 
    }));
    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardSpending).toBe(true);
  });

  it('TRANSFER_IN_ACCOUNT_TRANSFER + "Venmo from Jane" -> person_to_person -> not recognized income', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'TRANSFER_IN', 
      catDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER', 
      name: 'Venmo from Jane', 
      cashFlowAmount: '50' 
    }));
    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardIncome).toBe(false);
  });

  it('TRANSFER_OUT_ACCOUNT_TRANSFER with no P2P/provider evidence -> internal_transfer', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'TRANSFER_OUT', 
      catDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER', 
      name: 'Online Transfer to Checking', 
      cashFlowAmount: '-50' 
    }));
    expect(tx.classification).toBe('internal_transfer');
  });

  it('TRANSFER_IN_ACCOUNT_TRANSFER with no P2P/provider evidence -> internal_transfer', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'TRANSFER_IN', 
      catDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER', 
      name: 'Online Transfer from Savings', 
      cashFlowAmount: '50' 
    }));
    expect(tx.classification).toBe('internal_transfer');
  });

  it('same merchant + same category purchase/credit -> merchant_credit', () => {
    const rawPurchase = buildRow({ txId: 'p1', name: 'United Airlines', catPrimary: 'TRAVEL', cashFlowAmount: '-500' });
    const rawCredit = buildRow({ txId: 'c1', name: 'United Airlines', catPrimary: 'TRAVEL', cashFlowAmount: '500' });
    
    const txs = deduplicateAndNormalizeTransactions([['Transaction ID'], rawPurchase, rawCredit]);
    expect(txs[0].classification).toBe('spending');
    expect(txs[0].spendingAdjustment).toBe(500);
    
    expect(txs[1].classification).toBe('merchant_credit');
    expect(txs[1].spendingAdjustment).toBe(-500);
    
    const net = txs[0].spendingAdjustment + txs[1].spendingAdjustment;
    expect(net).toBe(0);
  });

  it('same merchant but materially different category with no refund evidence -> remain other', () => {
    const rawPurchase = buildRow({ txId: 'p1', name: 'Target', catPrimary: 'SHOPPING', cashFlowAmount: '-500' });
    const rawCredit = buildRow({ txId: 'c1', name: 'Target', catPrimary: 'ENTERTAINMENT', cashFlowAmount: '200' });
    
    const txs = deduplicateAndNormalizeTransactions([['Transaction ID'], rawPurchase, rawCredit]);
    expect(txs[1].classification).toBe('other');
  });

  it('LOAN_PAYMENTS + explicit CREDIT_CARD detailed category -> credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({
      catPrimary: 'LOAN_PAYMENTS',
      catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      name: 'UNKNOWN LOAN',
      cashFlowAmount: '-500'
    }));
    expect(tx.classification).toBe('credit_card_payment');
  });

  it('loan account + LOAN_PAYMENTS + AUTOMATIC PAYMENT -> NOT credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({
      accountType: 'loan',
      accountSubtype: 'mortgage',
      catPrimary: 'LOAN_PAYMENTS',
      name: 'AUTOMATIC PAYMENT',
      cashFlowAmount: '-500'
    }));
    expect(tx.classification).toBe('spending'); // Not credit card
  });

  it('depository account + generic LOAN_PAYMENTS + AUTOMATIC PAYMENT -> NOT credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({
      accountType: 'depository',
      accountSubtype: 'checking',
      catPrimary: 'LOAN_PAYMENTS',
      catDetailed: 'LOAN_PAYMENTS_OTHER',
      name: 'AUTOMATIC PAYMENT',
      cashFlowAmount: '-500'
    }));
    expect(tx.classification).toBe('spending');
  });

  it('positive merchant credit with no corresponding spending evidence -> other', () => {
    const rawCredit = buildRow({ txId: 'c1', name: 'Unknown Store', catPrimary: 'SHOPPING', cashFlowAmount: '200' });
    const txs = deduplicateAndNormalizeTransactions([['Transaction ID'], rawCredit]);
    expect(txs[0].classification).toBe('other');
  });

  it('purchase + credit-card payment -> purchase counted once', () => {
    const rawPurchase = buildRow({ txId: 'p1', name: 'Target', cashFlowAmount: '-50' });
    const rawPayment = buildRow({ txId: 'py1', name: 'AUTOMATIC PAYMENT', catPrimary: 'LOAN_PAYMENTS', accountType: 'credit', cashFlowAmount: '-1000' });
    const txs = deduplicateAndNormalizeTransactions([['Transaction ID'], rawPurchase, rawPayment]);
    
    expect(txs[0].classification).toBe('spending');
    expect(txs[1].classification).toBe('credit_card_payment');
  });
});
