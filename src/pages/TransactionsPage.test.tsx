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
  status: 'posted'
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
      if (url.includes('/api/transactions')) {
        return { ok: true, json: async () => mockRes };
      }
      if (url.includes('/api/accounts')) {
        return { ok: true, json: async () => ({ accounts: [] }) };
      }
      if (url.includes('/api/dashboard/categories')) {
        return { ok: true, json: async () => ({ categories: [] }) };
      }
      if (url.includes('/api/accounts')) return { ok: true, json: async () => ({ accounts: [] }) }; if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) }; return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    // Wait for the fetch to resolve
    await vi.waitFor(() => {
      expect(container.textContent).toContain('Starbucks');
    });

    // Validates that amount is formatted correctly
    expect(container.textContent).toContain('$4.50');
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
      if (url.includes('/api/transactions')) {
        return { ok: true, json: async () => mockRes };
      }
      if (url.includes('/api/accounts')) return { ok: true, json: async () => ({ accounts: [] }) }; if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) }; return { ok: true, json: async () => ({}) };
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

  it('shows error state when response structure is invalid', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/transactions')) {
        return { ok: true, json: async () => ({ transactions: 'not_an_array' }) };
      }
      if (url.includes('/api/accounts')) return { ok: true, json: async () => ({ accounts: [] }) }; if (url.includes('/api/dashboard/categories')) return { ok: true, json: async () => ({ categories: [] }) }; return { ok: true, json: async () => ({}) };
    });

    await act(async () => {
      root.render(<TransactionsPage apiFetch={apiFetch} refreshKey={0} />);
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Failed to load transactions');
    });
  });
});
