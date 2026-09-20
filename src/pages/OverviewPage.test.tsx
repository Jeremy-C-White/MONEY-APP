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
    merchantComparison: {
      asOfDate: '2026-09-06',
      currentPeriod: { startDate: '2026-09-01', endDate: '2026-09-06' },
      previousComparablePeriod: { startDate: '2026-08-01', endDate: '2026-08-06' },
      merchants: [{
        merchant: 'Walmart', currentSpending: 300, previousSpending: 250,
        difference: 50, percentageChange: 20, transactionCount: 3, isNew: false,
      }],
    },
    spendingBreakdown: {
      period: 'last_30_days',
      currentPeriod: { startDate: '2026-08-08', endDate: '2026-09-06' },
      previousComparablePeriod: { startDate: '2026-07-09', endDate: '2026-08-07' },
      categories: [{
        category: 'FOOD_AND_DRINK', currentSpending: 200, previousSpending: 180,
        difference: 20, percentageChange: 11.11, transactionCount: 4, percentage: 1,
      }],
      merchants: [{
        merchant: 'Walmart', currentSpending: 300, previousSpending: 250,
        difference: 50, percentageChange: 20, transactionCount: 3,
      }],
    },
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
    financialPosition: {
      currency: 'USD', mixedCurrency: false, liquidCash: 4000, liquidChecking: 1500, liquidSavings: 2500,
      estimatedNetWorth: 4000, includedAccountCount: 1, knownBalanceCount: 1,
      breakdown: {
        cashAndSavings: 4000, investmentsAndRetirement: null,
        propertyAndVehicles: null, liabilities: null,
      },
      excludedDuplicateCount: 0,
      netWorthHistory: [
        { date: '2026-09-05', estimatedNetWorth: 3900, liquidCash: 3900, coveredAccountCount: 1, expectedAccountCount: 1, status: 'complete' },
        { date: '2026-09-06', estimatedNetWorth: 4000, liquidCash: 4000, coveredAccountCount: 1, expectedAccountCount: 1, status: 'complete' },
      ],
      retirement: {
        total: null, accountCount: 0, knownBalanceCount: 0, shareOfNetWorth: null,
        history: [], trend: null, contributionDataAvailable: false,
      },
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
      summary: { upcomingBillTotal: 0, upcomingBillCount: 0, nextPaycheckDate: null, nextPaycheckAmount: null },
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
    rewardsYtd: {
      amount: 126.25,
      transactionCount: 8,
      startDate: '2026-01-01',
      endDate: '2026-09-06',
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
    yearOverYear: {
      status: 'not_comparable',
      currentPeriod: { startDate: '2026-09-01', endDate: '2026-09-06' },
      previousPeriod: { startDate: '2025-09-01', endDate: '2025-09-06' },
      currentSpending: 2400,
      previousSpending: 2000,
      difference: 400,
      percentageChange: 20,
      addedAccountCount: 1,
      removedAccountCount: 0,
    },
    coverage: {
      period: { startDate: '2025-09-07', endDate: '2026-09-06' },
      lowConfidence: { transactionCount: 3, amount: 420 },
      personToPerson: { transactionCount: 5, amount: 700 },
      cardPayments: { transactionCount: 8, amount: 2100, payees: ['Apple Card', "Sam's Club"] },
      cardPaymentsBeforeHistory: { transactionCount: 3, amount: 900, payees: ['Capital One'] },
      accountIssues: {
        accountCount: 1,
        accounts: [{ accountId: 'onepay', label: 'OnePay Checking', reason: 'stale' }],
      },
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
    const apiFetch = vi.fn(async (endpoint: string) => ({
      ok: true,
      json: async () => {
        if (endpoint.startsWith('/api/dashboard/spending-breakdown')) {
          return (payload as ReturnType<typeof overviewPayload>).spendingBreakdown;
        }
        if (endpoint === '/api/account-balances/refresh') {
          return { success: true, date: '2026-09-06', refreshedItemCount: 1, errors: [] };
        }
        return payload;
      },
    }) as Response);
    const onOpenPlanSettings = vi.fn();
    const onViewTransactions = vi.fn();
    const onOpenLowConfidence = vi.fn();
    const onOpenAccounts = vi.fn();
    const onOpenShopping = vi.fn();

    await act(async () => {
      root.render(
        <OverviewPage
          apiFetch={apiFetch}
          refreshKey={0}
          onReviewTransactions={vi.fn()}
          onViewTransactions={onViewTransactions}
          onOpenPlanSettings={onOpenPlanSettings}
          onOpenLowConfidence={onOpenLowConfidence}
          onOpenAccounts={onOpenAccounts}
          onOpenShopping={onOpenShopping}
        />
      );
    });

    return { apiFetch, onOpenPlanSettings, onViewTransactions, onOpenLowConfidence, onOpenAccounts, onOpenShopping };
  }

  it('leads with a single Now section for the current position', async () => {
    await renderOverview();

    const firstSection = container.querySelector('section');
    expect(firstSection?.textContent).toContain('Safe to spend');
    expect(firstSection?.textContent).toContain('$2,200.00');
    expect(firstSection?.textContent).toContain('Estimated net worth');
    expect(firstSection?.textContent).toContain('Checking$1,500.00');
    expect(firstSection?.textContent).toContain('Savings$2,500.00');
    expect(firstSection?.textContent).toContain('total $4,000.00 in liquid cash');
    expect(firstSection?.textContent).toContain('Net worth breakdown');
    expect(firstSection?.textContent).toContain('Cash & savings$4,000.00');
    expect(firstSection?.textContent).toContain('Up $100.00 since Sep 5, 2026');
    expect(firstSection?.textContent).not.toContain('Credit balances');
  });

  it('makes coverage gaps actionable without counting them as extra spending', async () => {
    const { onOpenLowConfidence, onOpenAccounts, onViewTransactions } = await renderOverview();
    expect(container.textContent).toContain('How complete is the picture?');
    expect(container.textContent).toContain("Plaid wasn't sure");
    expect(container.textContent).toContain('Card payments and person-to-person transfers are context, not extra spending.');
    expect(container.textContent).toContain('Card purchases not visible');
    expect(container.textContent).toContain('At least $2,100.00');
    expect(container.textContent).toContain('before linked-card history began and is not counted above');

    const buttons = Array.from(container.querySelectorAll('button'));
    await act(async () => buttons.find(button => button.textContent?.includes("Plaid wasn't sure"))?.click());
    await act(async () => buttons.find(button => button.textContent?.includes('Account freshness'))?.click());
    await act(async () => buttons.find(button => button.textContent?.includes('Between people'))?.click());

    expect(onOpenLowConfidence).toHaveBeenCalledTimes(1);
    expect(onOpenAccounts).toHaveBeenCalledTimes(1);
    expect(onViewTransactions).toHaveBeenCalledWith({
      classification: 'person_to_person',
      startDate: '2025-09-07',
      endDate: '2026-09-06',
    });
  });

  it('keeps the net-worth mix compact and hides zero debt', async () => {
    await renderOverview(overviewPayload({
      financialPosition: {
        ...overviewPayload().financialPosition,
        estimatedNetWorth: 504000,
        breakdown: {
          cashAndSavings: 4000,
          investmentsAndRetirement: 100000,
          propertyAndVehicles: 400000,
          liabilities: null,
        },
        netWorthHistory: [
          { date: '2026-09-05', estimatedNetWorth: 503000, liquidCash: 4000, coveredAccountCount: 3, expectedAccountCount: 3, status: 'complete' },
          { date: '2026-09-06', estimatedNetWorth: 504000, liquidCash: 4000, coveredAccountCount: 3, expectedAccountCount: 3, status: 'complete' },
        ],
      },
    }));

    expect(container.textContent).toContain('Investments & retirement$100,000.00');
    expect(container.textContent).toContain('Homes & vehicles$400,000.00');
    expect(container.textContent).toContain('Up $1,000.00 since Sep 5, 2026');
    expect(container.textContent).not.toContain('Credit balances');
  });

  it('shows Now, Heading, and Looking back without a detail disclosure', async () => {
    const { apiFetch } = await renderOverview();

    expect(container.textContent).toContain('Now');
    expect(container.textContent).toContain('Heading');
    expect(container.textContent).toContain('Looking back');
    expect(container.textContent).toContain('Projected month-end spending');
    expect(container.textContent).toContain('Top merchants');
    expect(container.textContent).toContain('Walmart');
    expect(container.textContent).toContain('Up from $250.00');
    expect(container.textContent).toContain('Top categories');
    expect(container.textContent).toContain('Year-over-year is not comparable — 1 account was added since last year.');
    expect(container.textContent).not.toContain('More detail');
    expect(container.textContent).not.toContain('Connected-account position');
    expect(apiFetch).toHaveBeenCalledWith('/api/dashboard/spending-breakdown?period=last_30_days');
  });

  it('drills into a merchant using the exact date range returned by the server', async () => {
    const { onViewTransactions } = await renderOverview();
    await vi.waitFor(() => expect(container.textContent).toContain('Walmart'));
    const walmartButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Walmart'));

    expect(walmartButton).toBeDefined();
    await act(async () => walmartButton?.click());

    expect(onViewTransactions).toHaveBeenCalledWith({
      merchantFamily: 'Walmart',
      startDate: '2026-08-08',
      endDate: '2026-09-06',
    });
  });

  it('renders the pacing comparison only once', async () => {
    await renderOverview();
    expect(container.textContent?.match(/same point last month/g)).toHaveLength(1);
    expect(container.textContent).toContain('Rewards this year');
    expect(container.textContent).toContain('$126.25');
  });

  it('captures a net-worth snapshot independently from transaction sync', async () => {
    const oneSnapshot = {
      ...overviewPayload().financialPosition,
      netWorthHistory: [
        { date: '2026-09-06', estimatedNetWorth: 4000, liquidCash: 4000, coveredAccountCount: 1, expectedAccountCount: 1, status: 'complete' },
      ],
    };
    const { apiFetch } = await renderOverview(overviewPayload({ financialPosition: oneSnapshot }));

    expect(container.textContent).toContain('Snapshot saved for Sep 6, 2026');
    expect(container.textContent).toContain('Capture another day to start the net-worth trend.');

    const captureButton = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Capture today')) as HTMLButtonElement;
    await act(async () => captureButton.click());

    expect(apiFetch).toHaveBeenCalledWith('/api/account-balances/refresh', { method: 'POST' });
    expect(container.textContent).toContain("Today's net-worth snapshot was saved.");
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
