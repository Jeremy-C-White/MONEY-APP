// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MerchantLabelsCard } from './MerchantLabelsCard';

const labels = [
  { ruleId: 'one', merchantKey: 'brookwood preschool', label: 'Preschool', createdFromTransactionId: 'tx1', createdAt: null, updatedAt: null },
  { ruleId: 'two', merchantKey: 'little gym', label: 'Kids', createdFromTransactionId: 'tx2', createdAt: null, updatedAt: null },
];

describe('MerchantLabelsCard', () => {
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

  it('renames a label everywhere and removes individual merchants', async () => {
    const apiFetch = vi.fn().mockImplementation(async (_endpoint: string, options?: RequestInit) => ({
      ok: true,
      json: async () => options?.method ? { success: true } : { labels },
    }));
    await act(async () => root.render(<MerchantLabelsCard apiFetch={apiFetch} />));
    await vi.waitFor(() => expect(container.textContent).toContain('Preschool'));

    const rename = container.querySelector('button[aria-label="Rename Preschool everywhere"]') as HTMLButtonElement;
    await act(async () => rename.click());
    await vi.waitFor(() => expect(container.querySelector('input')).not.toBeNull());
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Childcare');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await vi.waitFor(() => expect(container.querySelector('button[aria-label="Save Preschool"]')).not.toBeNull());
    const save = container.querySelector('button[aria-label="Save Preschool"]') as HTMLButtonElement;
    await act(async () => save.click());
    expect(apiFetch).toHaveBeenCalledWith('/api/merchant-labels', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ currentLabel: 'Preschool', label: 'Childcare' }),
    }));

    const remove = container.querySelector('button[aria-label="Remove little gym from Kids"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(apiFetch).toHaveBeenCalledWith('/api/merchant-labels/two', { method: 'DELETE' });
  });
});
