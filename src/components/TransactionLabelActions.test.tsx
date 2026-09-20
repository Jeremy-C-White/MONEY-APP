// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../types/finance';
import { TransactionLabelActions } from './TransactionLabelActions';

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transactionId: 'tx-1', accountId: 'checking', institutionName: 'Bank', accountName: 'Checking',
    accountMask: '1234', accountType: 'depository', accountSubtype: 'checking', rawDate: '2026-09-01',
    normalizedDate: '2026-09-01', name: 'BROOKWOOD PRESCHOOL', normalizedMerchant: 'Brookwood Preschool',
    plaidAmount: 500, cashFlowAmount: -500, categoryPrimary: 'GENERAL_SERVICES',
    categoryDetailed: 'GENERAL_SERVICES_OTHER', normalizedCategory: 'General services', pending: false,
    pendingTransactionId: '', status: 'posted', removed: false, classification: 'spending',
    countsTowardSpending: true, countsTowardIncome: false, spendingAdjustment: 500, incomeAdjustment: 0,
    isOverridden: false, overrideNote: null, overrideOffsetCategory: null, categoryConfidence: 'LOW',
    householdLabel: null, merchantKey: 'brookwood preschool', merchantLabelRuleId: null,
    ...overrides,
  };
}

describe('TransactionLabelActions', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('saves a household label for the merchant', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rule: { label: 'Preschool' } }) });
    const onChanged = vi.fn();
    await act(async () => root.render(<TransactionLabelActions transaction={transaction()} apiFetch={apiFetch} onChanged={onChanged} emphasized />));

    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Preschool');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = container.querySelector('button[aria-label="Save household label"]') as HTMLButtonElement;
    await act(async () => save.click());

    expect(apiFetch).toHaveBeenCalledWith('/api/transactions/tx-1/merchant-label', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ label: 'Preschool' }),
    }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('removes an existing household label', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const onChanged = vi.fn();
    await act(async () => root.render(
      <TransactionLabelActions
        transaction={transaction({ householdLabel: 'Preschool', merchantLabelRuleId: 'rule-1' })}
        apiFetch={apiFetch}
        onChanged={onChanged}
      />
    ));
    const remove = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Remove')) as HTMLButtonElement;
    await act(async () => remove.click());
    expect(apiFetch).toHaveBeenCalledWith('/api/transactions/tx-1/merchant-label', { method: 'DELETE' });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
