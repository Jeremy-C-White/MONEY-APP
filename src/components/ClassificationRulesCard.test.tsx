// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ClassificationRulesCard } from './ClassificationRulesCard';

describe('ClassificationRulesCard', () => {
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

  it('lists usage and allows a rule to be deleted without touching overrides', async () => {
    const apiFetch = vi.fn().mockImplementation(async (_url, options) => {
      if (options?.method === 'DELETE') {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return {
        ok: true,
        json: async () => ({
          rules: [{
            ruleId: 'rule_1',
            merchantKey: 'walmart',
            category: 'general_merchandise',
            direction: 'inflow',
            classification: 'refund',
            offsetCategory: 'GENERAL_MERCHANDISE',
            createdFromTransactionId: 'tx_1',
            createdAt: null,
            timesApplied: 2,
          }],
        }),
      };
    });

    await act(async () => {
      root.render(<ClassificationRulesCard apiFetch={apiFetch} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('walmart'));
    expect(container.textContent).toContain('Confirmed from this suggestion 2 times');

    const deleteButton = container.querySelector('button[aria-label="Delete suggestion for walmart"]') as HTMLButtonElement;
    await act(async () => deleteButton.click());

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/classification-rules/rule_1', { method: 'DELETE' });
      expect(container.textContent).not.toContain('Confirmed from this suggestion 2 times');
    });
  });
});
