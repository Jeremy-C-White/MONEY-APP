// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HouseholdInsights } from '../types/finance';
import { HouseholdInsightsCard } from './HouseholdInsightsCard';

const insights: HouseholdInsights = {
  asOfDate: '2026-09-09',
  weekly: {
    current: { startDate: '2026-09-07', endDate: '2026-09-09', spending: 150, income: 500, netCashFlow: 350 },
    previousComparable: { startDate: '2026-08-31', endDate: '2026-09-02', spending: 100, income: 500, netCashFlow: 400 },
    previousFull: { startDate: '2026-08-31', endDate: '2026-09-06', spending: 225, income: 500, netCashFlow: 275 },
    pendingSpending: 20,
    spendingDifference: 50,
    spendingPercentageChange: 50,
  },
  monthly: {
    current: { startDate: '2026-09-01', endDate: '2026-09-09', spending: 500, income: 1000, netCashFlow: 500 },
    previousComparable: { startDate: '2026-08-01', endDate: '2026-08-09', spending: 400, income: 900, netCashFlow: 500 },
    previousFull: { startDate: '2026-08-01', endDate: '2026-08-31', spending: 1200, income: 1800, netCashFlow: 600 },
    spendingDifference: 100,
    spendingPercentageChange: 25,
    categoryChanges: [{
      category: 'FOOD_AND_DRINK',
      currentSpending: 250,
      previousSpending: 100,
      difference: 150,
      percentageChange: 150,
    }],
  },
  forecast: {
    month: '2026-09',
    daysElapsed: 9,
    daysRemaining: 21,
    maturity: 'developing',
    postedSpending: 500,
    pendingSpending: 20,
    confirmedRecurringMonthly: 300,
    confirmedRecurringRemaining: 160,
    variableSpendingToDate: 300,
    projectedVariableRemaining: 700,
    projectedMonthEndSpending: 1380,
  },
};

describe('HouseholdInsightsCard', () => {
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

  it('explains weekly performance, category drivers, and the month-end estimate', () => {
    act(() => {
      root.render(<HouseholdInsightsCard insights={insights} />);
    });

    expect(container.textContent).toContain('This week');
    expect(container.textContent).toContain('$150.00');
    expect(container.textContent).toContain('Same days last week');
    expect(container.textContent).toContain('+$50.00 (50%)');
    expect(container.textContent).toContain('$400.00 at this point last month');
    expect(container.textContent).toContain('+$100.00 (25%)');
    expect(container.textContent).toContain('Food & dining');
    expect(container.textContent).toContain('$250.00 now');
    expect(container.textContent).toContain('Where this month is heading');
    expect(container.textContent).toContain('$1,380.00');
    expect(container.textContent).toContain('Confirmed recurring services are counted once.');
  });
});
