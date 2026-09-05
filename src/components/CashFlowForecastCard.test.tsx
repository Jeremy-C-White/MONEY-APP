// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CashFlowForecast } from '../types/finance';
import { CashFlowForecastCard } from './CashFlowForecastCard';

function forecast(overrides: Partial<CashFlowForecast> = {}): CashFlowForecast {
  return {
    status: 'ready',
    asOfDate: '2026-09-04',
    throughDate: '2026-10-04',
    balanceBasis: 'available',
    startingBalance: 2400,
    forecastAccount: {
      accountId: 'checking-1',
      institutionName: 'Bank',
      accountName: 'Checking',
      accountMask: '1234',
    },
    paycheckStreams: [{
      streamId: 'checking-1:SC123',
      source: 'Verizon payroll',
      accountId: 'checking-1',
      typicalAmount: 2800,
      cadence: 'biweekly',
      occurrenceCount: 8,
      lastDate: '2026-08-28',
      nextDate: '2026-09-11',
    }],
    upcomingBills: [{
      eventId: 'bill:internet:2026-09-07',
      date: '2026-09-07',
      kind: 'bill',
      direction: 'outflow',
      label: 'Internet Co',
      amount: 100,
      accountId: 'checking-1',
      accountName: 'Checking ••••1234',
      affectsForecastBalance: true,
    }, {
      eventId: 'bill:streaming:2026-09-08',
      date: '2026-09-08',
      kind: 'bill',
      direction: 'outflow',
      label: 'Streaming Co',
      amount: 20,
      accountId: 'credit-1',
      accountName: 'Rewards Card ••••9876',
      affectsForecastBalance: false,
    }],
    scheduledEvents: [{
      eventId: 'paycheck:checking-1:SC123:2026-09-11',
      date: '2026-09-11',
      kind: 'paycheck',
      direction: 'inflow',
      label: 'Verizon payroll',
      amount: 2800,
      accountId: 'checking-1',
      accountName: 'Checking ••••1234',
      affectsForecastBalance: true,
    }],
    dailyBalances: [
      { date: '2026-09-04', balance: 2400 },
      { date: '2026-09-07', balance: 2300 },
      { date: '2026-09-11', balance: 5100 },
    ],
    minimumBalance: 2300,
    minimumBalanceDate: '2026-09-07',
    warning: null,
    ...overrides,
  };
}

describe('CashFlowForecastCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
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

  it('shows the 30-day checking projection and seven-day bill alert', () => {
    act(() => root.render(<CashFlowForecastCard forecast={forecast()} />));

    expect(container.textContent).toContain('Scheduled cash outlook');
    expect(container.textContent).toContain('Bills expected in 7 days$120.00');
    expect(container.textContent).toContain('Starting available$2,400.00');
    expect(container.textContent).toContain('Next regular pay$2,800.00');
    expect(container.textContent).toContain('Verizon payroll');
    expect(container.textContent).toContain('Lowest scheduled balance$2,300.00');
    expect(container.textContent).toContain('Internet Co');
    expect(container.textContent).toContain('Streaming Co');
    expect(container.textContent).toContain('shown for awareness, not deducted here');
    expect(container.textContent).toContain('excludes bonuses, tax refunds');
  });

  it('keeps upcoming bills visible when the balance projection is stale', () => {
    act(() => root.render(<CashFlowForecastCard forecast={forecast({
      status: 'stale',
      dailyBalances: [],
      minimumBalance: null,
      minimumBalanceDate: null,
      warning: 'The payroll checking balance needs a fresh successful sync before it can be projected.',
    })} />));

    expect(container.textContent).toContain('Balance projection not ready');
    expect(container.textContent).toContain('fresh successful sync');
    expect(container.textContent).toContain('Internet Co');
  });
});
