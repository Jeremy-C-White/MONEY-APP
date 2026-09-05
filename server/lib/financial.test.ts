import { describe, it, expect } from 'vitest';
import { classifyTransaction, deduplicateAndNormalizeTransactions, parsePendingValue, type TransactionOverride } from './financial';
import { buildVerificationReport } from './aggregations';

function buildRow(overrides: Record<string, string>): any[] {
  const row = new Array(24).fill('');
  row[0] = overrides.txId || 'test_tx';
  row[1] = overrides.accountId || 'acc_1';
  row[4] = overrides.accountName || '';
  row[6] = overrides.accountType || 'depository';
  row[7] = overrides.accountSubtype || 'checking';
  row[8] = '45000'; // Date
  row[10] = overrides.name || 'Test Merchant';
  row[11] = overrides.merchantName || overrides.name || 'Test Merchant';
  row[13] = overrides.plaidAmount || '0';
  row[14] = Object.prototype.hasOwnProperty.call(overrides, 'cashFlowAmount')
    ? overrides.cashFlowAmount
    : '-50';
  row[16] = overrides.catPrimary || 'FOOD_AND_DRINK';
  row[17] = overrides.catDetailed || 'FOOD_AND_DRINK_RESTAURANT';
  row[20] = overrides.pending || 'FALSE';
  row[21] = overrides.pendingTransactionId || '';
  row[22] = overrides.status || 'posted';
  return row;
}

describe('PayPal account-role classification', () => {
  it('uses Plaid credit-card-payment evidence before the PayPal brand keyword', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PayPal Cashback Mastercard',
      cashFlowAmount: '-143.89',
      catPrimary: 'LOAN_PAYMENTS',
      catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      accountName: 'PayPal Cashback Mastercard',
      accountType: 'credit',
      accountSubtype: 'paypal',
    }));

    expect(tx.classification).toBe('credit_card_payment');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.spendingAdjustment).toBe(0);
  });

  it('treats the Wells Fargo PPCR repayment side as a credit-card payment', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PAYPAL INST XFER 260828 PPCR CC REPAYME JEREMY WHITE',
      cashFlowAmount: '-143.89',
      catPrimary: 'LOAN_PAYMENTS',
      catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      accountType: 'depository',
      accountSubtype: 'checking',
    }));

    expect(tx.classification).toBe('credit_card_payment');
    expect(tx.countsTowardSpending).toBe(false);
  });

  it('treats an explicit PayPal ADD TO BALANCE load as an internal transfer', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PAYPAL TRANSFER 251107 ADD TO BALANCE JEREMY WHITE',
      cashFlowAmount: '-40',
      catPrimary: 'TRANSFER_OUT',
      catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS',
      accountType: 'depository',
      accountSubtype: 'checking',
    }));

    expect(tx.classification).toBe('internal_transfer');
    expect(tx.countsTowardSpending).toBe(false);
  });

  it('treats historical Verizon-described PayPal prepaid loads as internal transfers', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payment from VERIZON V3 | DIR DEP',
      cashFlowAmount: '300',
      catPrimary: 'INCOME',
      catDetailed: 'INCOME_SALARY',
      accountName: 'PayPal',
      accountType: 'depository',
      accountSubtype: 'paypal',
    }));

    expect(tx.classification).toBe('internal_transfer');
    expect(tx.countsTowardIncome).toBe(false);
    expect(tx.incomeAdjustment).toBe(0);
  });

  it('keeps the same Verizon direct-deposit description as income on a checking account', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payment from VERIZON V3 | DIR DEP',
      cashFlowAmount: '300',
      catPrimary: 'INCOME',
      catDetailed: 'INCOME_SALARY',
      accountType: 'depository',
      accountSubtype: 'checking',
    }));

    expect(tx.classification).toBe('income');
    expect(tx.countsTowardIncome).toBe(true);
  });

  it('keeps a purchase made from the PayPal deposit account as spending', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payment to Walmart',
      merchantName: 'Walmart',
      cashFlowAmount: '-84.25',
      catPrimary: 'GENERAL_MERCHANDISE',
      catDetailed: 'GENERAL_MERCHANDISE_SUPERSTORES',
      accountName: 'PayPal',
      accountType: 'depository',
      accountSubtype: 'paypal',
    }));

    expect(tx.classification).toBe('spending');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(84.25);
  });

  it('reconciles equal owner funding rows across the linked PayPal and bank accounts', () => {
    const transactions = deduplicateAndNormalizeTransactions([
      buildRow({
        txId: 'paypal-in',
        accountId: 'paypal-account',
        name: 'Payment from Account Owner',
        cashFlowAmount: '100',
        catPrimary: 'TRANSFER_IN',
        catDetailed: 'TRANSFER_IN_TRANSFER_IN_FROM_APPS',
        accountType: 'depository',
        accountSubtype: 'paypal',
      }),
      buildRow({
        txId: 'bank-out',
        accountId: 'bank-account',
        name: 'MONEY TRANSFER AUTHORIZED ON 02/28 Account Owner Visa Direct CA CARD 4343',
        cashFlowAmount: '-100',
        catPrimary: 'TRANSFER_OUT',
        catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS',
        accountType: 'depository',
        accountSubtype: 'checking',
      }),
    ]);

    expect(transactions.map(transaction => transaction.classification)).toEqual([
      'internal_transfer',
      'internal_transfer',
    ]);
    expect(transactions.every(transaction => !transaction.countsTowardSpending && !transaction.countsTowardIncome)).toBe(true);
  });

  it('uses exact amount evidence and never consumes one counterpart twice', () => {
    const transactions = deduplicateAndNormalizeTransactions([
      buildRow({
        txId: 'paypal-in-1', accountId: 'paypal-account', name: 'Payment from Account Owner', cashFlowAmount: '50',
        catPrimary: 'TRANSFER_IN', catDetailed: 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', accountSubtype: 'paypal',
      }),
      buildRow({
        txId: 'paypal-in-2', accountId: 'paypal-account', name: 'Payment from Account Owner', cashFlowAmount: '50',
        catPrimary: 'TRANSFER_IN', catDetailed: 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', accountSubtype: 'paypal',
      }),
      buildRow({
        txId: 'bank-out', accountId: 'bank-account', name: 'PAYPAL INST XFER 241211 OWNER ACCOUNT', cashFlowAmount: '-50',
        catPrimary: 'ENTERTAINMENT', catDetailed: 'ENTERTAINMENT_MUSIC_AND_AUDIO', accountSubtype: 'checking',
      }),
      buildRow({
        txId: 'wrong-amount', accountId: 'bank-account', name: 'PAYPAL INST XFER 241211 OWNER ACCOUNT', cashFlowAmount: '-75',
        catPrimary: 'TRANSFER_OUT', catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', accountSubtype: 'checking',
      }),
    ]);

    expect(transactions.filter(transaction => transaction.classification === 'internal_transfer')).toHaveLength(2);
    expect(transactions.find(transaction => transaction.transactionId === 'wrong-amount')?.classification).toBe('person_to_person');
  });

  it('does not pair a same-value transfer to a different person', () => {
    const transactions = deduplicateAndNormalizeTransactions([
      buildRow({
        txId: 'paypal-in', accountId: 'paypal-account', name: 'Payment from Account Owner', cashFlowAmount: '100',
        catPrimary: 'TRANSFER_IN', catDetailed: 'TRANSFER_IN_TRANSFER_IN_FROM_APPS', accountSubtype: 'paypal',
      }),
      buildRow({
        txId: 'bank-out', accountId: 'bank-account',
        name: 'MONEY TRANSFER AUTHORIZED ON 02/28 Different Person Visa Direct CA CARD 9999',
        cashFlowAmount: '-100', catPrimary: 'TRANSFER_OUT',
        catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS', accountSubtype: 'checking',
      }),
    ]);

    expect(transactions.map(transaction => transaction.classification)).toEqual(['other', 'person_to_person']);
  });

  it('keeps a genuine PayPal transfer to another person as P2P spending', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PayPal transfer to Jane',
      cashFlowAmount: '-50',
      catPrimary: 'TRANSFER_OUT',
      catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS',
      accountType: 'depository',
      accountSubtype: 'checking',
    }));

    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(50);
  });

  it('does not count either side of a card payment as household spending', () => {
    const transactions = deduplicateAndNormalizeTransactions([
      buildRow({
        txId: 'wells-payment',
        name: 'PAYPAL INST XFER 260828 PPCR CC REPAYME JEREMY WHITE',
        cashFlowAmount: '-143.89',
        catPrimary: 'LOAN_PAYMENTS',
        catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      }),
      buildRow({
        txId: 'paypal-payment',
        name: 'PayPal Cashback Mastercard',
        cashFlowAmount: '-143.89',
        catPrimary: 'LOAN_PAYMENTS',
        catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        accountName: 'PayPal Cashback Mastercard',
        accountType: 'credit',
        accountSubtype: 'paypal',
      }),
      buildRow({
        txId: 'purchase',
        name: 'Walmart',
        cashFlowAmount: '-84.25',
        catPrimary: 'GENERAL_MERCHANDISE',
        catDetailed: 'GENERAL_MERCHANDISE_SUPERSTORES',
      }),
    ]);
    const report = buildVerificationReport(transactions, 'America/New_York');

    expect(report.summary.allTime.spending).toBe(84.25);
    expect(report.reconciliation.p2pOutgoingCount).toBe(0);
    expect(report.reconciliation.creditCardCount).toBe(2);
    expect(report.reconciliation.creditCardAmount).toBe(287.78);
  });
});

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

describe('Confirmed transfer reconciliation', () => {
  it('classifies investment and retirement fund transfers separately from spending', () => {
    const tx = classifyTransaction(buildRow({
      name: 'SOFI SECURITIES ACH Jul 20 20260717032771 JEREMY WHITE',
      cashFlowAmount: '-300',
      catPrimary: 'TRANSFER_OUT',
      catDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS'
    }));

    expect(tx.classification).toBe('investment_transfer');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
  });

  it.each([
    ['SAVE AS YOU GO TRANSFER DEBIT TO XXXXXXXXXXX3569', '-1', 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS'],
    ['SAVE AS YOU GO TRANSFER CREDIT FROM XXXXXXXXXXX7357', '1', 'TRANSFER_IN', 'TRANSFER_IN_OTHER_TRANSFER_IN'],
    ['APPLE GS SAVINGS TRANSFER 910130061426 Jeremy White', '-500', 'TRANSFER_OUT', 'TRANSFER_OUT_SAVINGS'],
    ['NFCU ACCTVERIFY 250312 1200269 NAME NOT PRESENT', '-0.19', 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT']
  ])('classifies confirmed own-account movement %s as internal', (name, cashFlowAmount, catPrimary, catDetailed) => {
    const tx = classifyTransaction(buildRow({ name, cashFlowAmount, catPrimary, catDetailed }));

    expect(tx.classification).toBe('internal_transfer');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
  });

  it.each([
    ['One Finance, Inc ACH Trans Jeremy White', 'TRANSFER_IN', 'TRANSFER_IN_DEPOSIT'],
    ['ONE FINANCE INC. ACH TRANS. JEREMY WHITE', 'TRANSFER_IN', 'TRANSFER_IN_DEPOSIT'],
    ['One Finance, Inc ACH Trans Jeremy White Jeremy White', 'LOAN_DISBURSEMENTS', 'LOAN_DISBURSEMENTS_CASH_ADVANCES'],
  ])('reconciles positive One Finance ACH deposits as own-account transfers', (name, catPrimary, catDetailed) => {
    const tx = classifyTransaction(buildRow({
      name,
      cashFlowAmount: '250',
      catPrimary,
      catDetailed,
      accountType: 'depository',
    }));

    expect(tx.classification).toBe('internal_transfer');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
    expect(tx.spendingAdjustment).toBe(0);
    expect(tx.incomeAdjustment).toBe(0);
  });

  it.each([
    ['-250', 'TRANSFER_OUT', 'TRANSFER_OUT_OTHER_TRANSFER_OUT', 'depository'],
    ['250', 'OTHER', 'OTHER_OTHER', 'depository'],
    ['250', 'TRANSFER_IN', 'TRANSFER_IN_DEPOSIT', 'credit'],
  ])('does not auto-reconcile an out-of-scope One Finance ACH row', (cashFlowAmount, catPrimary, catDetailed, accountType) => {
    const tx = classifyTransaction(buildRow({
      name: 'One Finance, Inc ACH Trans Jeremy White',
      cashFlowAmount,
      catPrimary,
      catDetailed,
      accountType,
    }));

    expect(tx.classification).not.toBe('internal_transfer');
  });

  it('classifies confirmed outgoing Visa Direct app transfers as P2P spending', () => {
    const tx = classifyTransaction(buildRow({
      name: 'MONEY TRANSFER AUTHORIZED ON 07/30 White Jeremy Visa Direct CA S585211486237120 CARD 3625',
      cashFlowAmount: '-150',
      catPrimary: 'TRANSFER_OUT',
      catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS'
    }));

    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(150);
  });

  it('does not treat an unrelated Visa Direct transfer as confirmed P2P', () => {
    const tx = classifyTransaction(buildRow({
      name: 'VISA DIRECT TRANSFER',
      cashFlowAmount: '-150',
      catPrimary: 'TRANSFER_OUT',
      catDetailed: 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS'
    }));

    expect(tx.classification).toBe('other');
  });

  it('keeps a genuinely ambiguous incoming transfer in review as other', () => {
    const tx = classifyTransaction(buildRow({
      name: 'APPLE CASH BANK XFER Jeremy White Jeremy White',
      cashFlowAmount: '100',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_TRANSFER_IN_FROM_APPS'
    }));

    expect(tx.classification).toBe('other');
    expect(tx.countsTowardIncome).toBe(false);
  });

  it('groups a mobile check deposit for review without inferring its purpose', () => {
    const tx = classifyTransaction(buildRow({
      name: 'MOBILE DEPOSIT : REF NUMBER :410130858177',
      cashFlowAmount: '100',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_DEPOSIT'
    }));

    expect(tx.classification).toBe('unclassified_deposit');
    expect(tx.countsTowardIncome).toBe(false);
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
describe('Sandbox Acceptance Integration Rules', () => {
  it('classifies payroll income', () => {
    const tx = classifyTransaction(buildRow({ 
      catPrimary: 'INCOME', 
      catDetailed: 'INCOME_WAGES', 
      name: 'GUSTO PAY', 
      cashFlowAmount: '2000' 
    }));
    expect(tx.classification).toBe('income');
    expect(tx.countsTowardIncome).toBe(true);
    expect(tx.incomeAdjustment).toBe(2000);
  });
  
  it('explicit refund with REFUND string', () => {
    const tx = classifyTransaction(buildRow({ 
      name: 'AMAZON REFUND', 
      cashFlowAmount: '50' 
    }));
    expect(tx.classification).toBe('refund');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(-50);
  });
});

describe('Semantic Earned Income Detection', () => {
  it('identifies positive checking deposit with payroll description as income despite incorrect Plaid category', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Sweetgreen inc payroll ppd id',
      cashFlowAmount: '810',
      catPrimary: 'FOOD_AND_DRINK',
      catDetailed: 'FOOD_AND_DRINK_RESTAURANT',
      accountType: 'depository',
      accountSubtype: 'checking'
    }));
    expect(tx.classification).toBe('income');
    expect(tx.normalizedCategory).toBe('INCOME');
    expect(tx.categoryPrimary).toBe('FOOD_AND_DRINK');
    expect(tx.countsTowardIncome).toBe(true);
    expect(tx.countsTowardSpending).toBe(false);
  });

  it('identifies direct deposit', () => {
    const tx = classifyTransaction(buildRow({
      name: 'DIRECT DEPOSIT ACME CORP',
      cashFlowAmount: '1000',
      accountType: 'depository',
      accountSubtype: 'checking'
    }));
    expect(tx.classification).toBe('income');
  });

  it('identifies salary/paycheck', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Salary',
      cashFlowAmount: '1000',
      accountType: 'depository',
      accountSubtype: 'checking'
    }));
    expect(tx.classification).toBe('income');
  });

  it('identifies Gusto processor', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Gusto payment',
      cashFlowAmount: '1000',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('income');
  });

  it('identifies ADP processor', () => {
    const tx = classifyTransaction(buildRow({
      name: 'ADP WAGE PAY',
      cashFlowAmount: '1000',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('income');
  });

  it('identifies Paychex processor', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PAYCHEX DIR DEP',
      cashFlowAmount: '1000',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('income');
  });

  it('identifies TriNet processor', () => {
    const tx = classifyTransaction(buildRow({
      name: 'TRINET HR PAY',
      cashFlowAmount: '1000',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('income');
  });

  it('identifies Intuit Payroll processor', () => {
    const tx = classifyTransaction(buildRow({
      name: 'INTUIT PAYROLL',
      cashFlowAmount: '1000',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('income');
  });

  it('negative payroll-looking transaction is not income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payroll service fee',
      cashFlowAmount: '-100',
      accountType: 'depository'
    }));
    expect(tx.classification).not.toBe('income');
  });

  it('positive non-depository payroll-looking transaction is not semantic earned income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PAYROLL',
      cashFlowAmount: '1000',
      accountType: 'credit'
    }));
    expect(tx.classification).not.toBe('income');
  });

  it('generic positive ACH is not automatically income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'ACH Deposit',
      cashFlowAmount: '100',
      accountType: 'depository',
      accountSubtype: 'checking'
    }));
    expect(tx.classification).not.toBe('income');
  });

  it('generic positive PPD is not automatically income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'PPD ID 12345',
      cashFlowAmount: '100',
      accountType: 'depository'
    }));
    expect(tx.classification).not.toBe('income');
  });

  it('incoming P2P takes precedence over income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Venmo payout payroll',
      cashFlowAmount: '100',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardIncome).toBe(false);
  });

  it('interest takes precedence over income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Interest Payment payroll account',
      cashFlowAmount: '10',
      accountType: 'depository',
      accountSubtype: 'savings'
    }));
    expect(tx.classification).toBe('interest_earned');
  });

  it('explicit refund takes precedence over income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Refund Amazon payroll item',
      cashFlowAmount: '50',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('refund');
  });

  it('generic account transfer is not income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Transfer from Checking',
      cashFlowAmount: '100',
      catDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('internal_transfer');
  });

  it('payroll + generic account transfer becomes income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Gusto payroll',
      cashFlowAmount: '1000',
      catDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
      accountType: 'depository'
    }));
    expect(tx.classification).toBe('income');
  });
});


describe('Semantic Credit Card Payment Detection', () => {
  it('identifies Payment Thank You-Mobile on credit account as credit_card_payment despite INCOME_SALARY', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payment Thank You-Mobile',
      cashFlowAmount: '2835.80',
      catPrimary: 'INCOME',
      catDetailed: 'INCOME_SALARY',
      accountType: 'credit',
      accountSubtype: 'credit card'
    }));
    expect(tx.classification).toBe('credit_card_payment');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
  });

  it('identifies existing automatic payment on credit account', () => {
    const tx = classifyTransaction(buildRow({
      name: 'AUTOMATIC PAYMENT - THANK',
      cashFlowAmount: '500',
      accountType: 'credit'
    }));
    expect(tx.classification).toBe('credit_card_payment');
  });

  it('identifies payment punctuation variants', () => {
    const variants = [
      'PAYMENT - THANK YOU',
      'PAYMENT THANK YOU',
      'PAYMENT-THANK'
    ];
    for (const v of variants) {
      const tx = classifyTransaction(buildRow({
        name: v,
        cashFlowAmount: '500',
        accountType: 'credit'
      }));
      expect(tx.classification).toBe('credit_card_payment');
    }
  });

  it('generic payment merchant without strong semantics is not credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payment Depot Store',
      cashFlowAmount: '-100',
      accountType: 'credit'
    }));
    expect(tx.classification).not.toBe('credit_card_payment');
  });

  it('non-credit account with thank you name is not semantic credit_card_payment', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Payment Thank You-Mobile',
      cashFlowAmount: '100',
      accountType: 'depository',
      accountSubtype: 'checking'
    }));
    expect(tx.classification).not.toBe('credit_card_payment');
  });

  it('preserves existing explicit Plaid credit-card payment', () => {
    const tx = classifyTransaction(buildRow({
      name: 'UNKNOWN LOAN',
      catPrimary: 'LOAN_PAYMENTS',
      catDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      cashFlowAmount: '-500',
      accountType: 'loan'
    }));
    expect(tx.classification).toBe('credit_card_payment');
  });

  it('Sweetgreen payroll remains income and is unaffected', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Sweetgreen inc payroll ppd id',
      cashFlowAmount: '810',
      catPrimary: 'FOOD_AND_DRINK',
      catDetailed: 'FOOD_AND_DRINK_RESTAURANT',
      accountType: 'depository',
      accountSubtype: 'checking'
    }));
    expect(tx.classification).toBe('income');
  });
});


describe('Classification corrections', () => {
  it.each([
    ['0'],
    [''],
    ['not-a-number'],
  ])('classifies a zero or unparseable cash flow as zero_amount: %s', (cashFlowAmount) => {
    const tx = classifyTransaction(buildRow({
      name: 'MEMBERSHIP FEE JUN 26-MAY 27',
      cashFlowAmount,
      catPrimary: 'BANK_FEES',
      catDetailed: 'BANK_FEES_OTHER_BANK_FEES',
    }));

    expect(tx.cashFlowAmount).toBe(0);
    expect(tx.classification).toBe('zero_amount');
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.countsTowardIncome).toBe(false);
    expect(tx.spendingAdjustment).toBe(0);
    expect(tx.incomeAdjustment).toBe(0);
  });

  it('classifies an IRS tax refund as income, not refund (must precede refund check)', () => {
    const tx = classifyTransaction(buildRow({
      name: 'IRS TREAS 310 TAX REF',
      cashFlowAmount: '3251.33',
      catPrimary: 'INCOME',
      catDetailed: 'INCOME_TAX_REFUND',
    }));
    expect(tx.classification).toBe('income');
    expect(tx.countsTowardIncome).toBe(true);
    expect(tx.incomeAdjustment).toBe(3251.33);
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.spendingAdjustment).toBe(0);
  });

  it('classifies a state tax refund as income the same way', () => {
    const tx = classifyTransaction(buildRow({
      name: 'SC STATE TREASURY',
      cashFlowAmount: '150',
      catPrimary: 'INCOME',
      catDetailed: 'INCOME_TAX_REFUND',
    }));
    expect(tx.classification).toBe('income');
    expect(tx.countsTowardIncome).toBe(true);
  });

  it('classifies credit card cash-back rewards as income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'CITICARDS CASH REWARD',
      cashFlowAmount: '25.50',
      catPrimary: 'OTHER',
      catDetailed: 'OTHER_OTHER',
    }));
    expect(tx.classification).toBe('income');
    expect(tx.countsTowardIncome).toBe(true);
    expect(tx.incomeAdjustment).toBe(25.50);
    expect(tx.countsTowardSpending).toBe(false);
  });

  it.each([
    ['Reward Redemption', 14.39],
    ['Merchant Offers Credit', 20],
  ])('classifies the exact issuer reward wording as income: %s', (name, amount) => {
    const tx = classifyTransaction(buildRow({
      name,
      cashFlowAmount: String(amount),
      catPrimary: 'OTHER',
      catDetailed: 'OTHER_OTHER',
    }));

    expect(tx.classification).toBe('income');
    expect(tx.countsTowardIncome).toBe(true);
    expect(tx.incomeAdjustment).toBe(amount);
    expect(tx.countsTowardSpending).toBe(false);
  });

  it('keeps a provisional dispute credit out of income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'CITIBANK CONDITIONAL CREDIT FOR DISPUTE',
      cashFlowAmount: '399',
      catPrimary: 'OTHER',
      catDetailed: 'OTHER_OTHER',
      accountType: 'credit',
      accountSubtype: 'credit card',
    }));

    expect(tx.classification).toBe('other');
    expect(tx.countsTowardIncome).toBe(false);
    expect(tx.countsTowardSpending).toBe(false);
  });

  it.each([
    ['cashback bonus deposit'],
    ['cash back rewards redemption'],
  ])('matches cash-back wording case-insensitively: %s', (name) => {
    const tx = classifyTransaction(buildRow({
      name,
      cashFlowAmount: '10',
      catPrimary: 'OTHER',
      catDetailed: 'OTHER_OTHER',
    }));
    expect(tx.classification).toBe('income');
  });

  it('negative case: cash-back wording does not override an already-refund classification (guard)', () => {
    const tx = classifyTransaction(buildRow({
      name: 'TARGET CASH BACK REFUND',
      cashFlowAmount: '15',
      catDetailed: 'GENERAL_MERCHANDISE_REFUND',
    }));
    expect(tx.classification).toBe('refund');
    expect(tx.countsTowardSpending).toBe(true);
    expect(tx.spendingAdjustment).toBe(-15);
  });

  it('negative case: cash-back wording does not override an already-P2P classification (guard)', () => {
    const tx = classifyTransaction(buildRow({
      name: 'Venmo cash back from Jane',
      cashFlowAmount: '15',
      catPrimary: 'TRANSFER_IN',
    }));
    expect(tx.classification).toBe('person_to_person');
    expect(tx.countsTowardIncome).toBe(false);
  });

  it('negative case: an unrelated positive OTHER_OTHER inflow is not swept into cash-back income', () => {
    const tx = classifyTransaction(buildRow({
      name: 'RANDOM MERCHANT CREDIT ADJUSTMENT',
      cashFlowAmount: '10',
      catPrimary: 'OTHER',
      catDetailed: 'OTHER_OTHER',
    }));
    expect(tx.classification).toBe('other');
    expect(tx.countsTowardIncome).toBe(false);
  });

  it('classifies a mobile check deposit as unclassified: not income, not spending', () => {
    const tx = classifyTransaction(buildRow({
      name: 'MOBILE DEPOSIT : REF NUMBER :410130858177',
      cashFlowAmount: '1197.69',
      accountType: 'depository',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_DEPOSIT',
    }));
    expect(tx.classification).toBe('unclassified_deposit');
    expect(tx.countsTowardIncome).toBe(false);
    expect(tx.countsTowardSpending).toBe(false);
    expect(tx.incomeAdjustment).toBe(0);
    expect(tx.spendingAdjustment).toBe(0);
  });

  it('negative case: TRANSFER_IN_DEPOSIT on a non-depository account is not an unclassified deposit', () => {
    const tx = classifyTransaction(buildRow({
      name: 'MOBILE DEPOSIT : REF NUMBER :410130858177',
      cashFlowAmount: '1197.69',
      accountType: 'credit',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_DEPOSIT',
    }));
    expect(tx.classification).not.toBe('unclassified_deposit');
  });

  it('negative case: a negative TRANSFER_IN_DEPOSIT cash flow is not an unclassified deposit', () => {
    const tx = classifyTransaction(buildRow({
      name: 'MOBILE DEPOSIT REVERSAL',
      cashFlowAmount: '-50',
      accountType: 'depository',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_DEPOSIT',
    }));
    expect(tx.classification).not.toBe('unclassified_deposit');
  });
});

describe('parsePendingValue', () => {
  it('parses boolean correctly', () => {
    expect(parsePendingValue(true)).toBe(true);
    expect(parsePendingValue(false)).toBe(false);
  });
  it('parses strings correctly', () => {
    expect(parsePendingValue('TRUE')).toBe(true);
    expect(parsePendingValue('true')).toBe(true);
    expect(parsePendingValue('Yes')).toBe(true);
    expect(parsePendingValue('yes')).toBe(true);
    expect(parsePendingValue('FALSE')).toBe(false);
    expect(parsePendingValue('false')).toBe(false);
    expect(parsePendingValue('No')).toBe(false);
    expect(parsePendingValue('no')).toBe(false);
    expect(parsePendingValue('')).toBe(false);
    expect(parsePendingValue(undefined)).toBe(false);
  });
});

describe('Transaction overrides', () => {
  const override = (
    classification: TransactionOverride['classification'],
    offsetCategory: string | null = null,
    note: string | null = null
  ): TransactionOverride => ({ classification, offsetCategory, note });

  it.each([
    ['income', true, false, 200, 0],
    ['spending', false, true, 0, -200],
    ['refund', false, true, 0, -200],
    ['internal_transfer', false, false, 0, 0],
  ] as const)(
    'recomputes adjustments for a %s override',
    (classification, countsTowardIncome, countsTowardSpending, incomeAdjustment, spendingAdjustment) => {
      const row = buildRow({
        txId: 'deposit_1',
        cashFlowAmount: '200',
        catPrimary: 'TRANSFER_IN',
        catDetailed: 'TRANSFER_IN_DEPOSIT',
      });
      const transactions = deduplicateAndNormalizeTransactions(
        [row],
        new Map([['deposit_1', override(classification, classification === 'refund' ? 'FOOD_AND_DRINK' : null, 'Reviewed')]])
      );

      expect(transactions[0]).toMatchObject({
        classification,
        countsTowardIncome,
        countsTowardSpending,
        incomeAdjustment,
        spendingAdjustment,
        isOverridden: true,
        overrideNote: 'Reviewed',
        overrideOffsetCategory: classification === 'refund' ? 'FOOD_AND_DRINK' : null,
      });
    }
  );

  it.each([
    { pending: 'TRUE', status: 'posted' },
    { pending: 'FALSE', status: 'removed' },
  ])('ignores overrides for pending or removed transactions', ({ pending, status }) => {
    const row = buildRow({
      txId: 'blocked_1',
      cashFlowAmount: '200',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_DEPOSIT',
      pending,
      status,
    });
    const [transaction] = deduplicateAndNormalizeTransactions(
      [row],
      new Map([['blocked_1', override('income')]])
    );

    expect(transaction.isOverridden).toBe(false);
    expect(transaction.classification).not.toBe('income');
  });

  it('removing an override restores the original classifier result', () => {
    const row = buildRow({
      txId: 'deposit_1',
      cashFlowAmount: '200',
      catPrimary: 'TRANSFER_IN',
      catDetailed: 'TRANSFER_IN_DEPOSIT',
    });
    const [overridden] = deduplicateAndNormalizeTransactions(
      [row],
      new Map([['deposit_1', override('income')]])
    );
    const [restored] = deduplicateAndNormalizeTransactions([row], new Map());

    expect(overridden.classification).toBe('income');
    expect(restored.classification).toBe('unclassified_deposit');
    expect(restored.isOverridden).toBe(false);
  });

  it('an empty override map leaves every reconciliation figure unchanged', () => {
    const rows = [
      ['Transaction ID'],
      buildRow({ txId: 'spend_1', cashFlowAmount: '-50' }),
      buildRow({
        txId: 'deposit_1',
        cashFlowAmount: '200',
        catPrimary: 'TRANSFER_IN',
        catDetailed: 'TRANSFER_IN_DEPOSIT',
      }),
    ];

    const baseline = buildVerificationReport(
      deduplicateAndNormalizeTransactions(rows),
      'America/New_York'
    );
    const withEmptyOverrides = buildVerificationReport(
      deduplicateAndNormalizeTransactions(rows, new Map()),
      'America/New_York'
    );

    expect(withEmptyOverrides.reconciliation).toEqual(baseline.reconciliation);
  });
});
