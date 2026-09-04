import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedTransaction } from './financial';
import {
  parseTransactionOverrideInput,
  removeTransactionOverride,
  saveTransactionOverride,
  TransactionOverrideRequestError,
  type TransactionOverrideServiceDependencies,
} from './transaction-overrides';

function transaction(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    transactionId: 'tx_1',
    accountId: 'account_1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    rawDate: '45000',
    normalizedDate: '2026-08-15',
    name: 'Deposit',
    normalizedMerchant: 'Deposit',
    plaidAmount: -200,
    cashFlowAmount: 200,
    categoryPrimary: 'TRANSFER_IN',
    categoryDetailed: 'TRANSFER_IN_DEPOSIT',
    normalizedCategory: 'TRANSFER_IN',
    pending: false,
    pendingTransactionId: '',
    status: 'posted',
    removed: false,
    classification: 'unclassified_deposit',
    countsTowardSpending: false,
    countsTowardIncome: false,
    spendingAdjustment: 0,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
    ...overrides,
  };
}

describe('transaction override validation', () => {
  it('rejects an invalid classification with status 400', () => {
    expect(() => parseTransactionOverrideInput({ classification: 'salary_magic' }))
      .toThrowError(expect.objectContaining({ status: 400 }));
  });

  it.each(['pending', 'removed'])('rejects %s as an override classification', classification => {
    expect(() => parseTransactionOverrideInput({ classification }))
      .toThrowError(expect.objectContaining({ status: 400 }));
  });

  it('rejects offsetCategory unless the override is a refund', () => {
    expect(() => parseTransactionOverrideInput({
      classification: 'income',
      offsetCategory: 'FOOD_AND_DRINK',
    })).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it('accepts a refund category and normalizes an empty note to null', () => {
    expect(parseTransactionOverrideInput({
      classification: 'refund',
      offsetCategory: ' FOOD_AND_DRINK ',
      note: '   ',
    })).toEqual({
      classification: 'refund',
      offsetCategory: 'FOOD_AND_DRINK',
      note: null,
    });
  });

  it('rejects notes longer than 500 characters', () => {
    expect(() => parseTransactionOverrideInput({
      classification: 'income',
      note: 'x'.repeat(501),
    })).toThrowError(expect.objectContaining({ status: 400 }));
  });
});
describe('transaction override service', () => {
  let dependencies: TransactionOverrideServiceDependencies;

  beforeEach(() => {
    dependencies = {
      loadTransactions: vi.fn().mockResolvedValue([transaction()]),
      persistOverride: vi.fn().mockResolvedValue(undefined),
      deleteOverride: vi.fn().mockResolvedValue(undefined),
      invalidateCache: vi.fn(),
      reviewedAt: vi.fn().mockReturnValue('timestamp'),
    };
  });

  it('rejects an unknown transaction ID before writing', async () => {
    await expect(saveTransactionOverride(
      dependencies,
      'user_1',
      'missing',
      { classification: 'income' }
    )).rejects.toEqual(expect.objectContaining({
      status: 404,
      message: 'Transaction not found.',
    }));

    expect(dependencies.persistOverride).not.toHaveBeenCalled();
    expect(dependencies.invalidateCache).not.toHaveBeenCalled();
  });

  it.each([
    transaction({ pending: true }),
    transaction({ removed: true }),
  ])('rejects pending and removed ledger rows', async blockedTransaction => {
    vi.mocked(dependencies.loadTransactions).mockResolvedValue([blockedTransaction]);

    await expect(saveTransactionOverride(
      dependencies,
      'user_1',
      'tx_1',
      { classification: 'income' }
    )).rejects.toBeInstanceOf(TransactionOverrideRequestError);

    expect(dependencies.persistOverride).not.toHaveBeenCalled();
  });

  it('writes the reviewed record and invalidates cache after success', async () => {
    const result = await saveTransactionOverride(
      dependencies,
      'user_1',
      'tx_1',
      { classification: 'refund', offsetCategory: 'FOOD_AND_DRINK', note: 'Group groceries' }
    );

    expect(result).toEqual({
      classification: 'refund',
      offsetCategory: 'FOOD_AND_DRINK',
      note: 'Group groceries',
      reviewedAt: 'timestamp',
      reviewedBy: 'user_1',
    });
    expect(dependencies.persistOverride).toHaveBeenCalledWith('user_1', 'tx_1', result, null, null);
    expect(dependencies.invalidateCache).toHaveBeenCalledWith('user_1');
  });

  it('does not invalidate cache when persistence fails', async () => {
    vi.mocked(dependencies.persistOverride).mockRejectedValue(new Error('write failed'));

    await expect(saveTransactionOverride(
      dependencies,
      'user_1',
      'tx_1',
      { classification: 'income' }
    )).rejects.toThrow('write failed');

    expect(dependencies.invalidateCache).not.toHaveBeenCalled();
  });

  it('deletes an override and invalidates cache', async () => {
    await removeTransactionOverride(dependencies, 'user_1', 'tx_1');

    expect(dependencies.deleteOverride).toHaveBeenCalledWith('user_1', 'tx_1');
    expect(dependencies.invalidateCache).toHaveBeenCalledWith('user_1');
  });

  it('atomically persists a remembered rule with its source override', async () => {
    await saveTransactionOverride(
      dependencies,
      'user_1',
      'tx_1',
      { classification: 'income', rememberRule: true }
    );

    expect(dependencies.persistOverride).toHaveBeenCalledWith(
      'user_1',
      'tx_1',
      expect.objectContaining({ classification: 'income' }),
      expect.objectContaining({
        merchantKey: 'deposit',
        category: 'transfer_in',
        direction: 'inflow',
        classification: 'income',
        timesApplied: 0,
      }),
      null
    );
  });

  it('confirms only the suggestion currently attached to the transaction', async () => {
    const suggested = transaction({
      classificationSuggestion: {
        ruleId: 'rule_1',
        classification: 'income',
        offsetCategory: null,
      },
    });
    vi.mocked(dependencies.loadTransactions).mockResolvedValue([suggested]);

    await saveTransactionOverride(dependencies, 'user_1', 'tx_1', {
      classification: 'income',
      suggestionRuleId: 'rule_1',
    });
    expect(dependencies.persistOverride).toHaveBeenCalledWith(
      'user_1',
      'tx_1',
      expect.objectContaining({ classification: 'income' }),
      null,
      'rule_1'
    );

    await expect(saveTransactionOverride(dependencies, 'user_1', 'tx_1', {
      classification: 'spending',
      suggestionRuleId: 'rule_1',
    })).rejects.toEqual(expect.objectContaining({ status: 400 }));
  });
});
