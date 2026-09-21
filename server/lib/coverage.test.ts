import { describe, expect, it } from 'vitest';
import type { EnrichedTransaction } from './transaction-enrichment';
import { buildCoverageReport } from './coverage';

function transaction(overrides: Partial<EnrichedTransaction>): EnrichedTransaction {
  return {
    transactionId: 'tx', accountId: 'a1', institutionName: 'Bank', accountName: 'Card', accountMask: '1234',
    accountType: 'credit', accountSubtype: 'credit card', rawDate: '', normalizedDate: '2026-09-10',
    name: 'Merchant', normalizedMerchant: 'Merchant', plaidAmount: 100, cashFlowAmount: -100,
    categoryPrimary: 'GENERAL_MERCHANDISE', categoryDetailed: 'GENERAL_MERCHANDISE_OTHER',
    normalizedCategory: 'GENERAL_MERCHANDISE', pending: false, pendingTransactionId: '', status: 'posted',
    removed: false, classification: 'spending', countsTowardSpending: true, countsTowardIncome: false,
    spendingAdjustment: 100, incomeAdjustment: 0, isOverridden: false, overrideNote: null,
    overrideOffsetCategory: null, categoryConfidence: 'HIGH', householdLabel: null, merchantKey: 'merchant',
    merchantLabelRuleId: null, ...overrides,
  };
}

describe('buildCoverageReport', () => {
  it('quantifies only factual visibility limitations in the trailing 12 months', () => {
    const report = buildCoverageReport({
      asOfDate: '2026-09-20',
      transactions: [
        transaction({ transactionId: 'low', categoryConfidence: 'LOW', spendingAdjustment: 250 }),
        transaction({ transactionId: 'labeled-low', categoryConfidence: 'LOW', householdLabel: 'Preschool', spendingAdjustment: 500 }),
        transaction({ transactionId: 'p2p', classification: 'person_to_person', cashFlowAmount: -75, spendingAdjustment: 75 }),
        transaction({ transactionId: 'card', accountType: 'depository', classification: 'credit_card_payment', cashFlowAmount: -400, countsTowardSpending: false, spendingAdjustment: 0 }),
        transaction({ transactionId: 'old', normalizedDate: '2025-09-19', categoryConfidence: 'LOW', spendingAdjustment: 999 }),
      ],
      accounts: [
        { accountId: 'a1', institutionName: 'OnePay', accountName: 'Checking', source: 'linked', health: 'healthy', balanceStatus: 'stale' },
        { accountId: 'a2', institutionName: 'Bank', accountName: 'Savings', source: 'linked', health: 'healthy', balanceStatus: 'fresh' },
      ],
    });

    expect(report).not.toHaveProperty('lowConfidence');
    expect(report.personToPerson).toEqual({ transactionCount: 1, amount: 75 });
    expect(report.cardPayments).toEqual({ transactionCount: 1, amount: 400, payees: ['Merchant'] });
    expect(report.cardPaymentsBeforeHistory).toEqual({ transactionCount: 0, amount: 0, payees: [] });
    expect(report.accountIssues).toEqual({
      accountCount: 1,
      accounts: [{ accountId: 'a1', label: 'OnePay Checking', reason: 'stale' }],
    });
  });

  it('flags a regularly used account whose transaction feed has gone quiet', () => {
    const report = buildCoverageReport({
      asOfDate: '2026-09-20',
      transactions: [transaction({ accountId: 'onepay', normalizedDate: '2026-04-25' })],
      accounts: [{
        accountId: 'onepay', institutionName: 'OnePay', accountName: 'Checking', source: 'linked',
        health: 'healthy', balanceStatus: 'fresh', accountType: 'depository', accountSubtype: 'checking',
      }],
    });

    expect(report.accountIssues.accounts).toEqual([{
      accountId: 'onepay', label: 'OnePay Checking', reason: 'activity',
    }]);
  });
});
