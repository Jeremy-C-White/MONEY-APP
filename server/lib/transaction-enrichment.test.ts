import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction } from './financial';
import {
  buildMerchantLabelRule,
  enrichTransactions,
  filterTransactionEnrichment,
  parseMerchantLabelRule,
} from './transaction-enrichment';

function transaction(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    transactionId: 'tx-1', accountId: 'a1', institutionName: 'Bank', accountName: 'Card', accountMask: '1234',
    accountType: 'credit', accountSubtype: 'credit card', rawDate: '', normalizedDate: '2026-09-10',
    name: 'BROOKWOOD PRESCHOOL 0910', normalizedMerchant: 'Brookwood Preschool', plaidAmount: 100,
    cashFlowAmount: -100, categoryPrimary: 'GENERAL_SERVICES', categoryDetailed: 'GENERAL_SERVICES_OTHER',
    normalizedCategory: 'GENERAL_SERVICES', pending: false, pendingTransactionId: '', status: 'posted',
    removed: false, classification: 'spending', countsTowardSpending: true, countsTowardIncome: false,
    spendingAdjustment: 100, incomeAdjustment: 0, isOverridden: false, overrideNote: null,
    overrideOffsetCategory: null, ...overrides,
  };
}

describe('transaction enrichment', () => {
  it('layers confidence and a merchant household label without replacing Plaid fields', () => {
    const tx = transaction();
    const rule = buildMerchantLabelRule(tx, 'Preschool', 'now');
    const row = new Array(25).fill('');
    row[0] = tx.transactionId;
    row[18] = 'LOW';

    const [enriched] = enrichTransactions([tx], [row], [rule]);
    expect(enriched).toMatchObject({
      categoryConfidence: 'LOW', householdLabel: 'Preschool', normalizedCategory: 'GENERAL_SERVICES',
      merchantKey: 'brookwood preschool', merchantLabelRuleId: rule.ruleId,
    });
  });

  it('filters the unresolved low-confidence queue and household-label drilldowns', () => {
    const labeled = enrichTransactions([transaction()], [], [buildMerchantLabelRule(transaction(), 'Kids', 'now')])[0];
    const unlabeled = { ...labeled, transactionId: 'tx-2', householdLabel: null, merchantLabelRuleId: null, categoryConfidence: 'LOW' as const };
    expect(filterTransactionEnrichment([labeled, unlabeled], { categoryConfidence: 'LOW', unlabeled: 'true' }))
      .toEqual([unlabeled]);
    expect(filterTransactionEnrichment([labeled, unlabeled], { householdLabel: 'kids' }))
      .toEqual([labeled]);
  });

  it('rejects invalid stored labels and unstable merchant labels', () => {
    expect(parseMerchantLabelRule('x', { merchantKey: '', label: 'Kids', createdFromTransactionId: 'tx' })).toBeNull();
    expect(() => buildMerchantLabelRule(transaction({ name: '12345678', normalizedMerchant: '12345678' }), 'Kids', 'now'))
      .toThrow("doesn't have a stable merchant name");
  });
});
