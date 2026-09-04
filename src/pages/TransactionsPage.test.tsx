// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TransactionsPage } from './TransactionsPage';

// Simple mock for fetch
const mockTx = {
  transactionId: 't_123',
  accountId: 'a_1',
  institutionName: 'Chase',
  accountMask: '1234',
  normalizedDate: '2026-08-15',
  name: 'STARBUCKS',
  normalizedMerchant: 'Starbucks',
  cashFlowAmount: -4.50,
  classification: 'spending',
  normalizedCategory: 'FOOD_AND_DRINK',
  pending: false,
  status: 'posted',
  isOverridden: false,
  overrideNote: null,
  overrideOffsetCategory: null,
};

const mockRes = {
  transactions: [mockTx],
  total: 1,
  page: 1,
  limit: 25,
  totalPages: 2
};

describe('TransactionsPage', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    // @ts-ignore
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders a valid transactions response', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/transactions')) return { ok: true, json: async () => mockRes };
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    // Wait for the fetch to resolve
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Starbucks');
    });

    // Validates that amount is formatted correctly
    expect(container.textContent).toContain('-$4.50');
    // Validates category/classification labels
    expect(container.textContent).toContain('Food & dining');
    // Validates account context
    expect(container.textContent).toContain('Chase');
    expect(container.textContent).toContain('1234');
    // Validates pagination metadata
    expect(container.textContent).toContain('1 transactions');
  });

  it('requests pending status when Pending is selected', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/transactions')) return { ok: true, json: async () => mockRes };
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    // Wait for initial load
    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });

    const pendingBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Pending'));
    expect(pendingBtn).toBeDefined();

    await act(async () => {
      pendingBtn?.click();
    });

    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('status=pending'));
  });

  it('requests both review classifications before server pagination', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/transactions')) return { ok: true, json: async () => mockRes };
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    const reviewTab = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Needs Review');

    await act(async () => {
      reviewTab?.click();
    });

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('classification=other%2Cunclassified_deposit'));
    });
    expect(container.textContent).toContain('1 transaction remains to review.');
  });

  it('opens directly in the actionable review queue when requested', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/transactions')) return { ok: true, json: async () => mockRes };
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(
        <TransactionsPage
          apiFetch={apiFetch}
          refreshKey={0}
          initialViewMode="needs_review"
        />
      );
    });

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('classification=other%2Cunclassified_deposit')
      );
    });
    expect(container.textContent).toContain('Select Review on a transaction');
    expect(container.textContent).toContain('If you are unsure, leave it here for later.');
  });

  it('saves a reimbursement review with its offset category and note', async () => {
    let saved = false;
    const reviewResponse = {
      ...mockRes,
      transactions: [{
        ...mockTx,
        cashFlowAmount: 200,
        classification: 'unclassified_deposit',
        normalizedCategory: 'TRANSFER_IN',
      }],
    };
    const apiFetch = vi.fn().mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') {
        saved = true;
        return { ok: true, json: async () => ({}) };
      }
      if (url.includes('/api/transactions')) {
        return {
          ok: true,
          json: async () => saved
            ? { ...mockRes, transactions: [], total: 0, totalPages: 0 }
            : reviewResponse,
        };
      }
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) {
        return { ok: true, json: async () => ({ categories: [{ category: 'FOOD_AND_DRINK' }] }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    const reviewTab = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Needs Review');
    await act(async () => {
      reviewTab?.click();
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Deposit — needs review'));

    const reviewButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Review');
    await act(async () => {
      reviewButton?.click();
    });

    const classificationSelect = container.querySelector('select[aria-label="Review classification"]') as HTMLSelectElement;
    await act(async () => {
      classificationSelect.value = 'refund';
      classificationSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const categorySelect = container.querySelector('select[aria-label="Reimbursement category"]') as HTMLSelectElement;
    const note = container.querySelector('textarea[aria-label="Override note"]') as HTMLTextAreaElement;
    await act(async () => {
      categorySelect.value = 'FOOD_AND_DRINK';
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
      const setTextareaValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      setTextareaValue?.call(note, 'Shared groceries');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Save review');
    await act(async () => {
      saveButton?.click();
    });

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/transactions/t_123/override',
        expect.objectContaining({ method: 'PUT' })
      );
    });
    const putCall = apiFetch.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(putCall?.[1]?.body as string)).toEqual({
      classification: 'refund',
      offsetCategory: 'FOOD_AND_DRINK',
      note: 'Shared groceries',
    });
  });

  it('shows reviewed transactions in the audit tab and supports undo', async () => {
    const overriddenResponse = {
      ...mockRes,
      transactions: [{
        ...mockTx,
        classification: 'income',
        isOverridden: true,
        overrideNote: 'Confirmed deposit',
      }],
    };
    const apiFetch = vi.fn().mockImplementation(async (url, options) => {
      if (options?.method === 'DELETE') return { ok: true, json: async () => ({ success: true }) };
      if (url.includes('/api/transactions')) return { ok: true, json: async () => overriddenResponse };
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    const reviewedTab = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Reviewed');
    await act(async () => {
      reviewedTab?.click();
    });

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('overridden=true'));
    });
    expect(container.textContent).toContain('Confirmed deposit');

    const undoButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Undo');
    await act(async () => {
      undoButton?.click();
    });

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/transactions/t_123/override',
        { method: 'DELETE' }
      );
    });
  });

  it('shows error state when response structure is invalid', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/transactions')) return { ok: true, json: async () => ({ transactions: 'not_an_array' }) };
      if (url.includes('/api/accounts')) return { ok: true, json: async () => [] };
      if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) };
      return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Failed to load transactions');
    });
  });

  it('clears unrelated filters when opening the complete Needs Review queue', async () => {
    const requestedEndpoints: string[] = [];
    const apiFetch = vi.fn().mockImplementation(async (endpoint) => {
      requestedEndpoints.push(endpoint);
      if (endpoint === '/api/accounts') {
        return { ok: true, json: async () => [{
          accountId: 'acc_1',
          institutionName: 'Example Bank',
          accountName: 'Checking',
          accountMask: '1234',
          accountType: 'depository',
          accountSubtype: 'checking',
          health: 'healthy',
        }] };
      }
      if (endpoint === '/api/dashboard/categories') {
        return { ok: true, json: async () => ({ categories: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          transactions: [],
          total: endpoint.includes('classification=other%2Cunclassified_deposit') ? 74 : 0,
          page: 1,
          limit: 25,
          totalPages: endpoint.includes('classification=other%2Cunclassified_deposit') ? 3 : 0,
        }),
      };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });
    await vi.waitFor(() => expect(container.querySelector('select')).not.toBeNull());

    const accountSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      accountSelect.value = 'acc_1';
      accountSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const reviewButton = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Needs Review');
    await act(async () => {
      reviewButton?.click();
    });

    await vi.waitFor(() => {
      const reviewRequest = requestedEndpoints
        .filter(endpoint => endpoint.startsWith('/api/transactions?'))
        .at(-1);
      expect(reviewRequest).toContain('classification=other%2Cunclassified_deposit');
      expect(reviewRequest).not.toContain('account=');
      expect(container.textContent).toContain('74 transactions remain to review.');
    });
  });
});
