// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewPage } from './OverviewPage';

function overviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    summary: {
      allTime: { spending: 0, income: 0, netCashFlow: 0, savingsRate: null, pendingSpending: 0, projectedSpending: 0 },
      currentMonth: { month: '2026-09', spending: 2400, income: 5000, netCashFlow: 2600, savingsRate: 0.52 },
      previousMonth: { month: '2026-08', spending: 4000, income: 9324, netCashFlow: 5324, savingsRate: 0.57 },
      comparison: { spendingDifference: -1600, spendingPercentageChange: -40 },
      pacing: {
        dayOfMonth: 6,
        daysInMonth: 30,
        previousMonthToDateSpending: 2000,
        previousMonthToDateIncome: 3000,
        spendingDifference: 400,
        spendingPercentageChange: 20,
      },
      activePostedCount: 120,
    },
    categories: [],
    merchants: [],
    trends: [{ month: '2026-09', income: 5000, spending: 2400, netCashFlow: 2600 }],
    recurringObligations: {
      obligations: [],
      estimatedMonthlyTotal: 0,
      confirmedMonthlyTotal: 0,
      suggestionCount: 0,
      analyzedThrough: '2026-09-06',
      forecast: [],
    },
    householdInsights: {
      asOfDate: '2026-09-06',
      weekly: {
        current: { startDate: '2026-09-01', endDate: '2026-09-06', spending: 500, income: 0, netCashFlow: -500 },
        previousComparable: { startDate: '2026-08-25', endDate: '2026-08-30', spending: 400, income: 0, netCashFlow: -400 },
        previousFull: { startDate: '2026-08-25', endDate: '2026-08-31', spending: 450, income: 0, netCashFlow: -450 },
        pendingSpending: 0,
        spendingDifference: 100,
        spendingPercentageChange: 25,
      },
      monthly: {
        current: { startDate: '2026-09-01', endDate: '2026-09-06', spending: 2400, income: 5000, netCashFlow: 2600 },
        previousComparable: { startDate: '2026-08-01', endDate: '2026-08-06', spending: 2000, income: 4000, netCashFlow: 2000 },
        previousFull: { startDate: '2026-08-01', endDate: '2026-08-31', spending: 4000, income: 9324, netCashFlow: 5324 },
        spendingDifference: 400,
        spendingPercentageChange: 20,
        categoryChanges: [],
      },
      forecast: {
        month: '2026-09',
        daysElapsed: 6,
        daysRemaining: 24,
        maturity: 'early',
        postedSpending: 2400,
        pendingSpending: 0,
        confirmedRecurringMonthly: 2180,
        confirmedRecurringRemaining: 2180,
        variableSpendingToDate: 220,
        projectedVariableRemaining: 880,
        projectedMonthEndSpending: 5460,
      },
    },
    verification: {
      summary: {},
      categories: [],
      merchants: [],
      reconciliation: { unknownTransferCount: 0, unknownTransferAmount: 0 },
    },
    accountBalances: {
      status: 'complete',
      currency: 'USD',
      oldestFetchedAt: '2026-09-06T12:00:00.000Z',
      newestFetchedAt: '2026-09-06T12:00:00.000Z',
      connectedItemCount: 1,
      reportingItemCount: 1,
      freshItemCount: 1,
      missingCurrentBalanceCount: 0,
      currencyIssueCount: 0,
      cashCurrent: 4000,
      cashAvailable: 4000,
      creditBalance: null,
      creditOwed: null,
      creditCredits: null,
      loanBalance: null,
      investmentValue: null,
      connectedPosition: 4000,
      issues: [],
      accounts: [],
    },
    cashFlowForecast: {
      status: 'unavailable',
      asOfDate: '2026-09-06',
      throughDate: '2026-10-06',
      balanceBasis: null,
      startingBalance: null,
      forecastAccount: null,
      paycheckStreams: [],
      upcomingBills: [],
      scheduledEvents: [],
      dailyBalances: [],
      minimumBalance: null,
      minimumBalanceDate: null,
      warning: 'No current regular Verizon payroll schedule could be confirmed.',
    },
    householdPlan: { safeToSpendBuffer: 0, monthlySpendingTarget: null },
    safeToSpend: {
      status: 'ready',
      asOfDate: '2026-09-06',
      throughDate: '2026-09-30',
      currency: 'USD',
      cashBasis: 'available',
      cashOnHand: 4000,
      cashAccountCount: 1,
      excludedCashAccountCount: 0,
      unassignedCashAccountCount: 0,
      billsDue: 1800,
      pendingOutflow: 0,
      buffer: 0,
      amount: 2200,
      deductions: [{
        deductionId: 'bill:preschool:2026-09-12',
        kind: 'bill',
        label: 'Brookwood Preschool',
        amount: 1800,
        date: '2026-09-12',
        accountName: 'Checking ••••1234',
      }],
      pendingReflectedInBalance: true,
      blockers: [],
      warning: null,
    },
    verdicts: {
      monthProgress: {
        month: '2026-09',
        dayOfMonth: 6,
        daysInMonth: 30,
        spending: 2400,
        income: 5000,
        netCashFlow: 2600,
        tone: 'positive',
      },
      lastCompletedMonth: null,
      pacing: {
        dayOfMonth: 6,
        daysInMonth: 30,
        previousMonthToDateSpending: 2000,
        spendingDifference: 400,
        spendingPercentageChange: 20,
        direction: 'ahead',
        driver: null,
        tone: 'caution',
      },
      categoryDrivers: [],
      targetProgress: null,
    },
    ...overrides,
  };
}

describe('OverviewPage', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    // @ts-ignore React act environment flag used by the existing native test setup.
    global.IS_REACT_ACT_ENVIRONMENT = true;
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderOverview(payload: unknown = overviewPayload()) {
    const apiFetch = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }) as Response);
    const onOpenPlanSettings = vi.fn();

    await act(async () => {
      root.render(
        <OverviewPage
          apiFetch={apiFetch}
          refreshKey={0}
          onReviewTransactions={vi.fn()}
          onViewTransactions={vi.fn()}
          onOpenPlanSettings={onOpenPlanSettings}
        />
      );
    });

    return { apiFetch, onOpenPlanSettings };
  }

  it('leads with safe to spend above everything else', async () => {
    await renderOverview();

    const firstSection = container.querySelector('section');
    expect(firstSection?.textContent).toContain('Safe to spend');
    expect(firstSection?.textContent).toContain('$2,200.00');
  });

  it('shows the four decision items and hides the rest behind More detail', async () => {
    await renderOverview();

    expect(container.textContent).toContain('Safe to spend');
    expect(container.textContent).toContain("September 2026 so far: you've kept $2,600.00.");
    expect(container.textContent).toContain('Still coming');
    expect(container.textContent).toContain('Connected-account position');

    expect(container.textContent).not.toContain('Cash Flow Trends');
    expect(container.textContent).not.toContain('Scheduled cash outlook');
    expect(container.textContent).toContain('More detail');
  });

  it('reveals the detail cards on request', async () => {
    await renderOverview();

    const toggle = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('More detail')) as HTMLButtonElement;
    await act(async () => { toggle.click(); });

    expect(container.textContent).toContain('Cash Flow Trends');
    expect(container.textContent).toContain('Less detail');
  });

  it('withholds the figure and explains why when balances are not fresh', async () => {
    await renderOverview(overviewPayload({
      safeToSpend: {
        ...overviewPayload().safeToSpend,
        status: 'unavailable',
        cashBasis: null,
        cashOnHand: null,
        billsDue: null,
        pendingOutflow: null,
        amount: null,
        deductions: [],
        blockers: ['stale_cash_balance'],
        warning: 'Cash balances are older than a successful sync, so this figure is withheld.',
      },
    }));

    expect(container.textContent).toContain('Safe to spend is unavailable');
    expect(container.textContent).not.toContain('$2,200.00');
  });
});
