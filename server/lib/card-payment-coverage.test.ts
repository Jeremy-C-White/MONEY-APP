import { describe, expect, it } from 'vitest';
import type { EnrichedTransaction } from './transaction-enrichment';
import { analyzeCardPaymentCoverage } from './card-payment-coverage';

function transaction(overrides: Partial<EnrichedTransaction>): EnrichedTransaction {
  return {
    transactionId: 'tx', accountId: 'checking', institutionName: 'Bank', accountName: 'Checking', accountMask: '1234',
    accountType: 'depository', accountSubtype: 'checking', rawDate: '', normalizedDate: '2026-09-10',
    name: 'CARD PAYMENT', normalizedMerchant: 'Card Payee', plaidAmount: 100, cashFlowAmount: -100,
    categoryPrimary: 'LOAN_PAYMENTS', categoryDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    normalizedCategory: 'Credit card payment', pending: false, pendingTransactionId: '', status: 'posted',
    removed: false, classification: 'credit_card_payment', countsTowardSpending: false, countsTowardIncome: false,
    spendingAdjustment: 0, incomeAdjustment: 0, isOverridden: false, overrideNote: null,
    overrideOffsetCategory: null, categoryConfidence: 'HIGH', householdLabel: null, merchantKey: 'card payee',
    merchantLabelRuleId: null, ...overrides,
  };
}

describe('analyzeCardPaymentCoverage', () => {
  it('learns linked payees from absolute card-payment matches across the full ledger', () => {
    const report = analyzeCardPaymentCoverage({
      startDate: '2025-09-21', endDate: '2026-09-20',
      transactions: [
        transaction({ transactionId: 'paypal-source', name: 'PAYPAL INST XFER PPCR CC REPAYME', normalizedMerchant: 'PayPal', merchantKey: 'paypal', cashFlowAmount: -1242.09 }),
        transaction({ transactionId: 'paypal-card', accountId: 'paypal-card', accountType: 'credit', accountSubtype: 'paypal', name: 'PAYMENT', normalizedMerchant: 'PayPal', merchantKey: 'payment', cashFlowAmount: 1242.09 }),
        transaction({ transactionId: 'paypal-earlier', normalizedDate: '2026-08-01', name: 'PAYPAL INST XFER PPCR CC REPAYME', normalizedMerchant: 'PayPal', merchantKey: 'paypal', cashFlowAmount: -500 }),
        transaction({ transactionId: 'paypal-purchase', accountId: 'paypal-card', accountType: 'credit', accountSubtype: 'paypal', normalizedDate: '2026-08-15', classification: 'spending', cashFlowAmount: -20 }),
      ],
    });
    expect(report.withoutPurchaseDetail).toEqual({ transactionCount: 0, amount: 0, payees: [] });
    expect(report.beforeLinkedHistory).toEqual({ transactionCount: 1, amount: 500, payees: ['PayPal'] });
  });

  it('does not let a same-amount purchase falsely prove that an unlinked payee is linked', () => {
    const report = analyzeCardPaymentCoverage({
      startDate: '2025-09-21', endDate: '2026-09-20',
      transactions: [
        transaction({ transactionId: 'apple-payment', name: 'APPLE CARD PAYMENT', normalizedMerchant: 'Apple Card', merchantKey: 'apple card', cashFlowAmount: -21.20 }),
        transaction({ transactionId: 'citi-purchase', accountId: 'citi', accountType: 'credit', accountSubtype: 'credit card', name: 'DOLLAR GENERAL', normalizedMerchant: 'Dollar General', classification: 'spending', cashFlowAmount: 21.20 }),
      ],
    });
    expect(report.withoutPurchaseDetail).toEqual({ transactionCount: 1, amount: 21.2, payees: ['Apple Card'] });
  });

  it('classifies history-limited payments by payee after a later match', () => {
    const report = analyzeCardPaymentCoverage({
      startDate: '2025-09-21', endDate: '2026-09-20',
      transactions: [
        transaction({ transactionId: 'capital-one-old', normalizedDate: '2026-04-01', normalizedMerchant: 'Capital One', merchantKey: 'capital one', cashFlowAmount: -900 }),
        transaction({ transactionId: 'capital-one-new', normalizedDate: '2026-07-01', normalizedMerchant: 'Capital One', merchantKey: 'capital one', cashFlowAmount: -700 }),
        transaction({ transactionId: 'savor-payment', accountId: 'savor', accountType: 'credit', accountSubtype: 'credit card', normalizedDate: '2026-07-02', cashFlowAmount: 700 }),
        transaction({ transactionId: 'savor-first', accountId: 'savor', accountType: 'credit', accountSubtype: 'credit card', normalizedDate: '2026-06-04', classification: 'spending', cashFlowAmount: -40 }),
        transaction({ transactionId: 'amazon', normalizedDate: '2026-08-01', normalizedMerchant: 'Amazon Store Card', merchantKey: 'amazon store card', cashFlowAmount: -500 }),
      ],
    });
    expect(report.withoutPurchaseDetail).toEqual({ transactionCount: 1, amount: 500, payees: ['Amazon Store Card'] });
    expect(report.beforeLinkedHistory).toEqual({ transactionCount: 1, amount: 900, payees: ['Capital One'] });
  });

  it('keeps OnePay linked when dated descriptors miss different matching windows', () => {
    const transactions = [
      transaction({ transactionId: 'onepay-april', normalizedDate: '2026-04-06', name: 'ONEPAY CASHREWRD SYF PAYMNT APR 06', normalizedMerchant: 'ONEPAY CASHREWRD SYF PAYMNT APR 06', merchantKey: null, cashFlowAmount: -500 }),
      transaction({ transactionId: 'onepay-april-card', accountId: 'onepay-card', accountType: 'credit', normalizedDate: '2026-04-10', name: 'PAYMENT', normalizedMerchant: 'Payment', merchantKey: 'payment', cashFlowAmount: 500 }),
      transaction({ transactionId: 'onepay-may', normalizedDate: '2026-05-26', name: 'ONEPAY CASHREWRD SYF PAYMNT MAY 26', normalizedMerchant: 'ONEPAY CASHREWRD SYF PAYMNT MAY 26', merchantKey: null, cashFlowAmount: -700 }),
      transaction({ transactionId: 'onepay-may-card', accountId: 'onepay-card', accountType: 'credit', normalizedDate: '2026-05-27', name: 'PAYMENT', normalizedMerchant: 'Payment', merchantKey: 'payment', cashFlowAmount: 700 }),
      transaction({ transactionId: 'onepay-history', accountId: 'onepay-card', accountType: 'credit', normalizedDate: '2025-10-01', classification: 'spending', cashFlowAmount: -25 }),
      transaction({ transactionId: 'amazon', normalizedDate: '2026-08-01', normalizedMerchant: 'Amazon Store Card', merchantKey: 'amazon store card', cashFlowAmount: -500 }),
    ];

    for (const dateWindowDays of [3, 5]) {
      const report = analyzeCardPaymentCoverage({
        startDate: '2025-09-21', endDate: '2026-09-20', transactions, dateWindowDays,
      });
      expect(report.withoutPurchaseDetail).toEqual({
        transactionCount: 1, amount: 500, payees: ['Amazon Store Card'],
      });
      expect(report.beforeLinkedHistory).toEqual({ transactionCount: 0, amount: 0, payees: [] });
    }
  });
});
