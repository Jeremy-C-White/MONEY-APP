import { describe, expect, it, vi } from 'vitest';
import { aggregateSummary } from './aggregations';
import type { NormalizedTransaction } from './financial';
import {
  applyClassificationSuggestions,
  buildClassificationRule,
  ClassificationRuleRequestError,
  parseStoredClassificationRule,
  removeClassificationRule,
} from './classification-rules';

function transaction(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    transactionId: 'tx_1', accountId: 'account_1', institutionName: 'Bank', accountName: 'Card',
    accountMask: '1234', accountType: 'credit', accountSubtype: 'credit card', rawDate: '45000',
    normalizedDate: '2026-08-15', name: 'Walmart', normalizedMerchant: 'Walmart', plaidAmount: -20,
    cashFlowAmount: 20, categoryPrimary: 'OTHER', categoryDetailed: 'OTHER_OTHER',
    normalizedCategory: 'GENERAL_MERCHANDISE', pending: false, pendingTransactionId: '', status: 'posted',
    removed: false, classification: 'other', countsTowardSpending: false, countsTowardIncome: false,
    spendingAdjustment: 0, incomeAdjustment: 0, isOverridden: false, overrideNote: null,
    overrideOffsetCategory: null, classificationSuggestion: null, ...overrides,
  };
}

describe('classification suggestions', () => {
  it('prefills a matching review without changing classification or totals', () => {
    const tx = transaction();
    const rule = buildClassificationRule(tx, {
      classification: 'refund',
      offsetCategory: 'GENERAL_MERCHANDISE',
      note: null,
    }, 'now');
    const [suggested] = applyClassificationSuggestions([tx], [rule]);

    expect(suggested.classificationSuggestion).toEqual({
      ruleId: rule.ruleId,
      classification: 'refund',
      offsetCategory: 'GENERAL_MERCHANDISE',
    });
    expect(suggested.classification).toBe('other');
    expect(suggested.spendingAdjustment).toBe(0);
    expect(suggested.incomeAdjustment).toBe(0);
    expect(aggregateSummary([suggested], 'America/New_York').allTime).toMatchObject({
      spending: 0,
      income: 0,
    });
  });

  it.each([
    transaction({ isOverridden: true }),
    transaction({ classification: 'income', countsTowardIncome: true, incomeAdjustment: 20 }),
    transaction({ name: 'CITIBANK CONDITIONAL CREDIT FOR DISPUTE', normalizedMerchant: 'CITIBANK CONDITIONAL CREDIT FOR DISPUTE' }),
  ])('never suggests over a manual, confident, or provisional classification', tx => {
    const rule = {
      ...buildClassificationRule(transaction(), { classification: 'income', offsetCategory: null, note: null }, 'now'),
      merchantKey: tx.normalizedMerchant.toLowerCase(),
    };
    expect(applyClassificationSuggestions([tx], [rule])[0].classificationSuggestion).toBeFalsy();
  });

  it('requires merchant, category, and direction to match', () => {
    const tx = transaction();
    const rule = buildClassificationRule(tx, { classification: 'income', offsetCategory: null, note: null }, 'now');

    expect(applyClassificationSuggestions([
      transaction({ normalizedCategory: 'FOOD_AND_DRINK' }),
      transaction({ cashFlowAmount: -20 }),
      transaction({ normalizedMerchant: 'Lowes', name: 'Lowes' }),
    ], [rule]).every(candidate => !candidate.classificationSuggestion)).toBe(true);
  });

  it('rejects malformed stored rules', () => {
    expect(parseStoredClassificationRule('bad', { merchantKey: 'Walmart' })).toBeNull();
  });

  it('deleting a rule cannot touch already-confirmed transaction overrides', async () => {
    const deleteRule = vi.fn().mockResolvedValue(undefined);
    const invalidateCache = vi.fn();
    await removeClassificationRule({ deleteRule, invalidateCache }, 'user_1', 'rule_1');

    expect(deleteRule).toHaveBeenCalledWith('user_1', 'rule_1');
    expect(invalidateCache).toHaveBeenCalledWith('user_1');
  });

  it('keys a rule on the derived prefix when Plaid supplies no merchant name, and matches a later transaction with a different reference number', () => {
    const first = transaction({
      transactionId: 'tx_1',
      name: 'TARGET DEBIT CRD ACH TRAN 250601 000018701232302 3S5540 TARGET 1870 SIMPSONVILLE S',
      normalizedMerchant: '',
    });
    const rule = buildClassificationRule(first, { classification: 'spending', offsetCategory: null, note: null }, 'now');
    expect(rule.merchantKey).toBe('target debit crd ach tran');

    const second = transaction({
      transactionId: 'tx_2',
      name: 'TARGET DEBIT CRD ACH TRAN 250815 000029813309213 7K1122 TARGET 1870 SIMPSONVILLE S',
      normalizedMerchant: '',
    });
    expect(applyClassificationSuggestions([second], [rule])[0].classificationSuggestion).toEqual({
      ruleId: rule.ruleId,
      classification: 'spending',
      offsetCategory: null,
    });
  });

  it('refuses to remember a decision when no stable merchant prefix can be derived', () => {
    const tx = transaction({ name: 'SQ *A1 208402', normalizedMerchant: '' });
    expect(() => buildClassificationRule(tx, { classification: 'spending', offsetCategory: null, note: null }, 'now'))
      .toThrow(ClassificationRuleRequestError);
  });
});
