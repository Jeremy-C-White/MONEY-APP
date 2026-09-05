// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WalmartInsightsPage } from './WalmartInsightsPage';

const report = {
  source: {
    spreadsheetTitle: 'Walmart_Orders',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit',
  },
  period: 'last_12_months',
  startDate: '2025-10-01',
  endDate: '2026-09-04',
  summary: {
    totalSpend: 1200,
    orderCount: 20,
    averageOrder: 60,
    onlineSpend: 900,
    inStoreSpend: 300,
    tips: 55,
    savings: 80,
    fuelSpend: 240,
    fuelGallons: 80,
    averageFuelPricePerGallon: 3,
    fuelPurchaseCount: 8,
  },
  monthly: [{ month: '2026-08', totalSpend: 300, fuelSpend: 60, orderCount: 5 }],
  topItems: [{
    productName: 'Organic Bananas',
    productUrl: 'https://www.walmart.com/ip/123456789',
    purchaseCount: 12,
    quantity: 14,
    spend: 25,
    lastPurchased: '2026-08-29',
  }],
  priceTrends: [{
    productName: 'Organic Bananas',
    productUrl: 'https://www.walmart.com/ip/123456789',
    purchaseCount: 12,
    firstPurchased: '2026-01-05',
    lastPurchased: '2026-08-29',
    firstUnitPrice: 2,
    latestUnitPrice: 2.5,
    lowUnitPrice: 1.8,
    highUnitPrice: 2.7,
    changeAmount: 0.5,
    changePercentage: 0.25,
    history: [
      { month: '2026-01', averageUnitPrice: 2, lowUnitPrice: 2, highUnitPrice: 2, purchaseCount: 1 },
      { month: '2026-08', averageUnitPrice: 2.5, lowUnitPrice: 2.5, highUnitPrice: 2.5, purchaseCount: 1 },
    ],
  }],
  recentOrders: [{
    orderNumber: 'order-1',
    date: '2026-08-29',
    channel: 'delivery',
    total: 80,
    tip: 5,
    savings: 3,
    itemCount: 1,
    fuel: false,
    items: [{
      productName: 'Organic Bananas',
      productUrl: 'https://www.walmart.com/ip/123456789',
      quantity: 1,
      price: 2,
      fuel: false,
    }],
  }],
  quality: {
    canceledItemRowsExcluded: 4,
    statusDuplicateRowsExcluded: 6,
    zeroDollarOrdersExcluded: 1,
    incompleteOrderStubsExcluded: 2,
  },
};

describe('WalmartInsightsPage', () => {
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

  it('loads spending and fuel insights and expands cleaned receipt items', async () => {
    const apiFetch = vi.fn().mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/walmart/source') {
        return {
          ok: true,
          json: async () => ({
            connected: true,
            spreadsheetId: 'sheet-id',
            spreadsheetTitle: 'Walmart_Orders',
            spreadsheetUrl: report.source.spreadsheetUrl,
          }),
        };
      }
      return { ok: true, json: async () => report };
    });

    await act(async () => {
      root.render(<WalmartInsightsPage apiFetch={apiFetch} />);
    });

    await vi.waitFor(() => expect(container.textContent).toContain('$1,200.00'));
    expect(container.textContent).toContain('80');
    expect(container.textContent).toContain('$3.00');
    expect(container.textContent).toContain('Organic Bananas');
    expect(container.textContent).toContain('Price watch');
    expect(container.textContent).toContain('25%');
    expect(container.textContent).toContain('Check current price');
    expect(container.querySelector('a[href="https://www.walmart.com/ip/123456789"]')).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith('/api/walmart/insights?period=last_12_months');

    const orderButton = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    await act(async () => orderButton.click());
    expect(container.textContent).toContain('Qty 1');
    expect(container.textContent).toContain('Saved $3.00');
  });

  it('connects a source from the empty state', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ connected: false }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          spreadsheetId: 'sheet-id',
          spreadsheetTitle: 'Walmart_Orders',
          spreadsheetUrl: report.source.spreadsheetUrl,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => report });

    await act(async () => {
      root.render(<WalmartInsightsPage apiFetch={apiFetch} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Connect Walmart purchase history'));

    const input = container.querySelector('input') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, report.source.spreadsheetUrl);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await vi.waitFor(() => expect(container.textContent).toContain('Spending habits & items'));
    expect(apiFetch).toHaveBeenCalledWith('/api/walmart/source', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ spreadsheetUrl: report.source.spreadsheetUrl }),
    }));
  });
});
