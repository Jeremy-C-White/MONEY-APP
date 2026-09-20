// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CategoryBreakdownCard } from './CategoryBreakdownCard';

function payload(period = 'last_30_days') {
  return {
    period,
    currentPeriod: { startDate: '2026-08-21', endDate: '2026-09-19' },
    previousComparablePeriod: { startDate: '2026-07-22', endDate: '2026-08-20' },
    categories: Array.from({ length: 11 }, (_, index) => ({
      category: index === 0 ? 'FOOD_AND_DRINK' : `CATEGORY_${index + 1}`,
      currentSpending: 110 - index,
      previousSpending: 50,
      difference: 60 - index,
      percentageChange: 120 - index * 2,
      transactionCount: index + 1,
      percentage: 0.1,
    })),
    merchants: Array.from({ length: 11 }, (_, index) => ({
      merchant: index === 0 ? 'Amazon' : `Merchant ${index + 1}`,
      currentSpending: 110 - index,
      previousSpending: 50,
      difference: 60 - index,
      percentageChange: 120 - index * 2,
      transactionCount: index + 1,
    })),
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

  it('shows five by default, expands five at a time, and drills down with server dates', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => payload() });
    const onDrillDown = vi.fn();
    await act(async () => {
      root.render(
        <CategoryBreakdownCard
          apiFetch={apiFetch}
          refreshKey={0}
          period="last_30_days"
          onDrillDown={onDrillDown}
        />
      );
    });

    await vi.waitFor(() => expect(container.textContent).toContain('Amazon'));
    expect(apiFetch).toHaveBeenCalledWith('/api/dashboard/spending-breakdown?period=last_30_days');
    expect(container.textContent).toContain('Food & dining');
    expect(container.textContent).toContain('Merchant 5');
    expect(container.textContent).not.toContain('Merchant 6');

    const showMore = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Show 5 more')
    ) as HTMLButtonElement;
    await act(async () => showMore.click());
    expect(container.textContent).toContain('Merchant 10');
    expect(container.textContent).not.toContain('Merchant 11');
    expect(container.textContent).toContain('Show less');

    const amazon = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Amazon')
    ) as HTMLButtonElement;
    act(() => amazon.click());
    expect(onDrillDown).toHaveBeenCalledWith({
      merchantFamily: 'Amazon', startDate: '2026-08-21', endDate: '2026-09-19',
    });

    const food = Array.from(container.querySelectorAll('button')).find(
      button => button.textContent?.includes('Food & dining')
    ) as HTMLButtonElement;
    act(() => food.click());
    expect(onDrillDown).toHaveBeenCalledWith({
      category: 'FOOD_AND_DRINK', startDate: '2026-08-21', endDate: '2026-09-19',
    });
  });

  it('resets expansion when the shared period changes', async () => {
    const apiFetch = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => payload(new URL(url, 'http://localhost').searchParams.get('period') || ''),
    }));
    const onDrillDown = vi.fn();
    await act(async () => {
      root.render(<CategoryBreakdownCard apiFetch={apiFetch} refreshKey={0} period="last_30_days" onDrillDown={onDrillDown} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Amazon'));
    const showMore = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Show 5 more')) as HTMLButtonElement;
    await act(async () => showMore.click());
    expect(container.textContent).toContain('Merchant 10');

    await act(async () => {
      root.render(<CategoryBreakdownCard apiFetch={apiFetch} refreshKey={0} period="last_7_days" onDrillDown={onDrillDown} />);
    });
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/dashboard/spending-breakdown?period=last_7_days'));
    expect(container.textContent).not.toContain('Merchant 6');
  });

  it('surfaces a load failure instead of silently showing nothing', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Could not load spending breakdown.' }),
    });
    await act(async () => {
      root.render(<CategoryBreakdownCard apiFetch={apiFetch} refreshKey={0} period="last_30_days" onDrillDown={vi.fn()} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Could not load spending breakdown.'));
  });
});
