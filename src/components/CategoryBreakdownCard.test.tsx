// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';

function payloadFor(period: string) {
  if (period === 'last_month') {
    return {
      period: 'last_month',
      startMonth: '2026-08',
      endMonth: '2026-08',
      categories: [
        {
          category: 'GENERAL_MERCHANDISE',
          netSpending: 200,
          transactionCount: 1,
          percentage: 1,
          previousSpending: null,
          change: null,
          details: [],
        },
      ],
      merchants: [{ merchant: 'Target', netSpending: 200, transactionCount: 1 }],
    };
  }

  return {
    period: 'this_month',
    startMonth: '2026-09',
    endMonth: '2026-09',
    categories: [
      {
        category: 'FOOD_AND_DRINK',
        netSpending: 85,
        transactionCount: 2,
        percentage: 1,
        previousSpending: 0,
        change: 85,
        details: [
          {
            categoryDetailed: 'FOOD_AND_DRINK_GROCERIES',
            netSpending: 60,
            transactionCount: 1,
            merchants: [{ merchant: 'Kroger', netSpending: 60, transactionCount: 1 }],
          },
        ],
      },
    ],
    merchants: [{ merchant: 'Kroger', netSpending: 60, transactionCount: 1 }],
  };
}

describe('CategoryBreakdownCard', () => {
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

  it('loads this month by default, expands a category to reveal its detailed breakdown, and switches period on demand', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url: string) => {
      const period = new URL(url, 'http://localhost').searchParams.get('period') || 'this_month';
      return { ok: true, json: async () => payloadFor(period) };
    });

    await act(async () => {
      root.render(<CategoryBreakdownCard apiFetch={apiFetch} refreshKey={0} />);
    });

    await vi.waitFor(() => expect(container.textContent).toContain('Food & dining'));
    expect(apiFetch).toHaveBeenCalledWith('/api/dashboard/category-breakdown?period=this_month');
    expect(container.textContent).toContain('$85.00');
    expect(container.textContent).toContain('up from $0.00');
    expect(container.textContent).not.toContain('Groceries');

    const categoryButton = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    expect(categoryButton).toBeTruthy();
    await act(async () => categoryButton.click());
    expect(container.textContent).toContain('Groceries');
    expect(container.textContent).toContain('Kroger');

    const lastMonthButton = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent === 'Last month'
    ) as HTMLButtonElement;
    await act(async () => lastMonthButton.click());

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/dashboard/category-breakdown?period=last_month');
      expect(container.textContent).toContain('General merchandise');
    });
    expect(container.textContent).not.toContain('Food & dining');
  });

  it('surfaces a load failure instead of silently showing nothing', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Could not load spending breakdown.' }),
    });

    await act(async () => {
      root.render(<CategoryBreakdownCard apiFetch={apiFetch} refreshKey={0} />);
    });

    await vi.waitFor(() => expect(container.textContent).toContain('Could not load spending breakdown.'));
  });
});
