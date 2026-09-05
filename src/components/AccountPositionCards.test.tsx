// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountBalanceSummary } from '../types/finance';
import { AccountPositionCards } from './AccountPositionCards';

function balances(overrides: Partial<AccountBalanceSummary> = {}): AccountBalanceSummary {
  return {
    status: 'complete',
    currency: 'USD',
    oldestFetchedAt: '2026-09-03T10:00:00.000Z',
    newestFetchedAt: '2026-09-03T11:00:00.000Z',
    connectedItemCount: 2,
    reportingItemCount: 2,
    freshItemCount: 2,
    missingCurrentBalanceCount: 0,
    currencyIssueCount: 0,
    cashCurrent: 2500,
    cashAvailable: 2400,
    creditBalance: 500,
    creditOwed: 500,
    creditCredits: 0,
    loanBalance: null,
    investmentValue: null,
    connectedPosition: 2000,
    issues: [],
    accounts: [],
    ...overrides,
  };
}

describe('AccountPositionCards', () => {
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

  it('leads with cash, card debt, spending, and the recurring-aware forecast', () => {
    act(() => {
      root.render(
        <AccountPositionCards
          balances={balances()}
          spending={725}
          spendingSubtitle="Compared with last month"
          projectedMonthEndSpending={1850}
          projectionMaturity="established"
        />
      );
    });

    expect(container.textContent).toContain('Cash in accounts');
    expect(container.textContent).toContain('$2,500.00');
    expect(container.textContent).toContain('Available now: $2,400.00');
    expect(container.textContent).toContain('Connected position: $2,000.00');
    expect(container.textContent).toContain('Card balances owed');
    expect(container.textContent).toContain('$500.00');
    expect(container.textContent).toContain('Spending this month');
    expect(container.textContent).toContain('$725.00');
    expect(container.textContent).toContain('Projected month-end');
    expect(container.textContent).toContain('$1,850.00');
    expect(container.textContent).toContain('Established estimate');
  });

  it('does not present missing balances as zero', () => {
    act(() => {
      root.render(
        <AccountPositionCards
          balances={balances({
            status: 'unavailable',
            reportingItemCount: 0,
            freshItemCount: 0,
            oldestFetchedAt: null,
            newestFetchedAt: null,
            cashCurrent: null,
            cashAvailable: null,
            creditBalance: null,
            creditOwed: null,
            creditCredits: null,
            connectedPosition: null,
          })}
          spending={0}
          spendingSubtitle={null}
          projectedMonthEndSpending={0}
          projectionMaturity="early"
        />
      );
    });

    expect(container.textContent).toContain('Account balances will appear after your next successful sync.');
    expect(container.textContent).toContain('Cash in accounts—');
    expect(container.textContent).toContain('Card balances owed—');
  });

  it('labels partial coverage instead of presenting it as complete', () => {
    act(() => {
      root.render(
        <AccountPositionCards
          balances={balances({ status: 'partial', reportingItemCount: 1 })}
          spending={100}
          spendingSubtitle={null}
          projectedMonthEndSpending={400}
          projectionMaturity="developing"
        />
      );
    });

    expect(container.textContent).toContain('Showing known balances.');
    expect(container.textContent).toContain('1 of 2 connections reporting');
  });
});
