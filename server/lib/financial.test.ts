import { describe, it, expect } from 'vitest';
import { classifyTransaction, deduplicateAndNormalizeTransactions, serialDateToYYYYMMDD } from './financial';

describe('Date Conversion', () => {
  it('converts excel serial date 45903 correctly', () => {
    // 45903 = 2025-09-03
    expect(serialDateToYYYYMMDD(45903)).toBe('2025-09-03');
  });

  it('converts first day of month correctly', () => {
    // 45870 = 2025-08-01
    expect(serialDateToYYYYMMDD(45870)).toBe('2025-08-01');
  });

  it('converts last day of month correctly', () => {
    // 45869 = 2025-07-31
    expect(serialDateToYYYYMMDD(45869)).toBe('2025-07-31');
  });
});

describe('Transaction Classification', () => {
  const baseRow = [
    'tx_1', 'acc_1', 'ins_1', 'Bank', 'Checking', '1234', 'depository', 'checking',
    45870, 45870, 'Target', 'Target', 'Target Store',
    0, 0, 'USD', '', '', 'HIGH', 'in store',
    'false', '', 'posted', '', ''
  ];

  it('classifies ordinary purchase as spending', () => {
    const row = [...baseRow];
    row[13] = 50; // Plaid Amount
    row[14] = -50; // Cash Flow Amount
    row[16] = 'GENERAL_MERCHANDISE';

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('spending');
    expect(classified.countsTowardSpending).toBe(true);
    expect(classified.countsTowardIncome).toBe(false);
    expect(classified.spendingAdjustment).toBe(-50);
  });

  it('classifies external income as income', () => {
    const row = [...baseRow];
    row[13] = -1000;
    row[14] = 1000;
    row[16] = 'INCOME';

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('income');
    expect(classified.countsTowardIncome).toBe(true);
    expect(classified.countsTowardSpending).toBe(false);
    expect(classified.incomeAdjustment).toBe(1000);
  });

  it('classifies TRANSFER_OUT as internal_transfer', () => {
    const row = [...baseRow];
    row[13] = 100;
    row[14] = -100;
    row[16] = 'TRANSFER_OUT';

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('internal_transfer');
    expect(classified.countsTowardSpending).toBe(false);
    expect(classified.countsTowardIncome).toBe(false);
  });

  it('classifies credit-card payment as credit_card_payment', () => {
    const row = [...baseRow];
    row[13] = 500;
    row[14] = -500;
    row[16] = 'LOAN_PAYMENTS';
    row[17] = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('credit_card_payment');
    expect(classified.countsTowardSpending).toBe(false);
  });

  it('classifies refund as refund and reduces net spending', () => {
    const row = [...baseRow];
    row[13] = -30; // Negative plaid amount = credit
    row[14] = 30; // Positive cash flow
    row[16] = 'GENERAL_MERCHANDISE'; // Original category

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('refund');
    expect(classified.countsTowardSpending).toBe(true);
    expect(classified.countsTowardIncome).toBe(false);
    expect(classified.spendingAdjustment).toBe(30);
  });

  it('classifies pending transaction', () => {
    const row = [...baseRow];
    row[20] = 'true';
    row[13] = 10;
    row[14] = -10;

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('pending');
  });

  it('classifies removed/reversed transaction', () => {
    const row = [...baseRow];
    row[22] = 'removed';
    row[23] = '2025-08-01T12:00:00Z';

    const classified = classifyTransaction(row);
    expect(classified.classification).toBe('removed');
    expect(classified.countsTowardSpending).toBe(false);
  });
});

describe('Pending -> Posted interaction', () => {
  it('deduplicates superseded pending transactions', () => {
    const baseRow = [
      '', 'acc_1', 'ins_1', 'Bank', 'Checking', '1234', 'depository', 'checking',
      45870, 45870, 'Target', 'Target', 'Target Store',
      50, -50, 'USD', 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_SUPERCENTERS', 'HIGH', 'in store',
      'false', '', 'posted', '', ''
    ];

    const pendingRow = [...baseRow];
    pendingRow[0] = 'pend_1';
    pendingRow[20] = 'true';

    const postedRow = [...baseRow];
    postedRow[0] = 'post_1';
    postedRow[21] = 'pend_1'; // pendingTransactionId

    const txs = deduplicateAndNormalizeTransactions([pendingRow, postedRow]);
    
    const pendTx = txs.find(t => t.transactionId === 'pend_1');
    const postTx = txs.find(t => t.transactionId === 'post_1');

    expect(postTx?.classification).toBe('spending');
    expect(postTx?.countsTowardSpending).toBe(true);
    
    expect(pendTx?.classification).toBe('removed');
    expect(pendTx?.countsTowardSpending).toBe(false);

    const totalSpending = txs.reduce((acc, t) => acc + (t.countsTowardSpending ? t.spendingAdjustment : 0), 0);
    expect(totalSpending).toBe(-50);
  });
});
