// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OverviewVerdicts } from '../types/finance';
import { MonthVerdictCard } from './MonthVerdictCard';

function verdicts(overrides: Partial<OverviewVerdicts> = {}): OverviewVerdicts {
  return {
    monthProgress: {
      month: '2026-09',
      dayOfMonth: 6,
      daysInMonth: 30,
      spending: 2400,
      income: 5000,
      netCashFlow: 2600,
      tone: 'positive',
    },
    lastCompletedMonth: {
      month: '2026-08',
      netCashFlow: 5324,
      rank: 'best',
      comparedMonthCount: 6,
      previousMonth: '2026-07',
      previousNetCashFlow: 1500,
      difference: 3824,
      tone: 'positive',
    },
    pacing: {
      dayOfMonth: 6,
      daysInMonth: 30,
      previousMonthToDateSpending: 2000,
      spendingDifference: 400,
      spendingPercentageChange: 20,
      direction: 'ahead',
      driver: { category: 'HOME_IMPROVEMENT', difference: 340, share: 0.85 },
      tone: 'caution',
    },
    categoryDrivers: [{
      category: 'HOME_IMPROVEMENT',
      currentSpending: 6400,
      previousSpending: 0,
      difference: 6400,
      percentageChange: null,
      movement: 'new',
      tone: 'caution',
    }],
    targetProgress: null,
    ...overrides,
  };
}

describe('MonthVerdictCard', () => {
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

  it('states the conclusion rather than only the figures', () => {
    act(() => root.render(<MonthVerdictCard verdicts={verdicts()} />));

    expect(container.textContent).toContain("September 2026 so far: you've kept $2,600.00.");
    expect(container.textContent).toContain(
      'About $400.00 (20%) ahead of last month at day 6, mostly Home Improvement.'
    );
    expect(container.textContent).toContain(
      'August 2026: you kept $5,324.00 — your best month in 6.'
    );
    expect(container.textContent).toContain('Home Improvement went from nothing to $6,400.00.');
  });

  it('says on track is unanswerable when no target is set', () => {
    act(() => root.render(<MonthVerdictCard verdicts={verdicts()} onSetTarget={() => {}} />));
    expect(container.textContent).toContain('No monthly target set');
  });

  it('states the target verdict when a target exists', () => {
    act(() => root.render(<MonthVerdictCard verdicts={verdicts({
      targetProgress: {
        month: '2026-09',
        target: 5000,
        spentToDate: 2400,
        remaining: 2600,
        expectedToDate: 1000,
        paceDifference: 1400,
        projectedMonthEndSpending: 6000,
        projectedDifference: 1000,
        projectionMaturity: 'developing',
        verdict: 'over',
      },
    })} onSetTarget={() => {}} />));

    expect(container.textContent).toContain(
      'Tracking to $6,000.00 against your $5,000.00 target — $1,000.00 over.'
    );
    expect(container.textContent).not.toContain('No monthly target set');
  });

  it('omits the completed-month line when there is nothing to report', () => {
    act(() => root.render(<MonthVerdictCard verdicts={verdicts({
      lastCompletedMonth: null,
      pacing: null,
      categoryDrivers: [],
    })} />));

    expect(container.textContent).toContain("September 2026 so far: you've kept $2,600.00.");
    expect(container.textContent).not.toContain('best month');
    expect(container.textContent).not.toContain('ahead of last month');
  });
});
