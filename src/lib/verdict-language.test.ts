import { describe, expect, it } from 'vitest';
import {
  describeCategoryDriver,
  describeCompletedMonth,
  describeMonthProgress,
  describePacing,
  describeSafeToSpend,
  describeTargetProgress,
} from './verdict-language';
import type { SafeToSpend } from '../types/finance';

describe('describeMonthProgress', () => {
  it('states what was kept', () => {
    expect(describeMonthProgress({
      month: '2026-09', dayOfMonth: 6, daysInMonth: 30,
      spending: 2400, income: 5000, netCashFlow: 2600, tone: 'positive',
    })).toBe("September 2026 so far: you've kept $2,600.00.");
  });

  it('states a shortfall without a negative sign', () => {
    expect(describeMonthProgress({
      month: '2026-09', dayOfMonth: 6, daysInMonth: 30,
      spending: 5400, income: 5000, netCashFlow: -400, tone: 'caution',
    })).toBe("September 2026 so far: you're $400.00 behind.");
  });
});

describe('describeCompletedMonth', () => {
  it('makes the best-month claim', () => {
    expect(describeCompletedMonth({
      month: '2026-08', netCashFlow: 5324, rank: 'best', comparedMonthCount: 6,
      previousMonth: '2026-07', previousNetCashFlow: 1500, difference: 3824, tone: 'positive',
    })).toBe('August 2026: you kept $5,324.00 — your best month in 6.');
  });

  it('makes the tightest-month claim', () => {
    expect(describeCompletedMonth({
      month: '2026-08', netCashFlow: -300, rank: 'tightest', comparedMonthCount: 5,
      previousMonth: '2026-07', previousNetCashFlow: 1500, difference: -1800, tone: 'caution',
    })).toBe('August 2026: you spent $300.00 more than you brought in — your tightest month in 5.');
  });

  it('falls back to a month-over-month comparison', () => {
    expect(describeCompletedMonth({
      month: '2026-08', netCashFlow: 2000, rank: 'middle', comparedMonthCount: 4,
      previousMonth: '2026-07', previousNetCashFlow: 1500, difference: 500, tone: 'positive',
    })).toBe('August 2026: you kept $2,000.00 — $500.00 better than July 2026.');
  });

  it('states the result alone when there is nothing to compare against', () => {
    expect(describeCompletedMonth({
      month: '2026-08', netCashFlow: 2000, rank: 'middle', comparedMonthCount: 1,
      previousMonth: null, previousNetCashFlow: null, difference: null, tone: 'positive',
    })).toBe('August 2026: you kept $2,000.00.');
  });
});

describe('describePacing', () => {
  const base = {
    dayOfMonth: 6, daysInMonth: 30, previousMonthToDateSpending: 2000,
    spendingPercentageChange: null, driver: null,
  };

  it('names the driver when the server identified one', () => {
    expect(describePacing({
      ...base, spendingDifference: 400, spendingPercentageChange: 20,
      direction: 'ahead', tone: 'caution',
      driver: { category: 'HOME_IMPROVEMENT', difference: 340, share: 0.85 },
    })).toBe('About $400.00 (20%) ahead of last month at day 6, mostly Home Improvement.');
  });

  it('omits the driver clause when none was identified', () => {
    expect(describePacing({
      ...base, spendingDifference: -500, direction: 'behind', tone: 'positive',
    })).toBe('About $500.00 behind last month at day 6.');
  });

  it('says level without a direction or amount', () => {
    expect(describePacing({
      ...base, spendingDifference: 10, direction: 'level', tone: 'neutral',
    })).toBe("You're spending at about the same pace as last month at day 6.");
  });
});

describe('describeCategoryDriver', () => {
  it('describes a category that appeared this month', () => {
    expect(describeCategoryDriver({
      category: 'HOME_IMPROVEMENT', currentSpending: 6400, previousSpending: 0,
      difference: 6400, percentageChange: null, movement: 'new', tone: 'caution',
    })).toBe('Home Improvement went from nothing to $6,400.00.');
  });

  it('describes a category that stopped', () => {
    expect(describeCategoryDriver({
      category: 'TRAVEL', currentSpending: 0, previousSpending: 900,
      difference: -900, percentageChange: -100, movement: 'stopped', tone: 'positive',
    })).toBe('Travel went from $900.00 to nothing.');
  });

  it('describes a category that moved', () => {
    expect(describeCategoryDriver({
      category: 'FOOD_AND_DRINK', currentSpending: 500, previousSpending: 450,
      difference: 50, percentageChange: 11.1, movement: 'up', tone: 'caution',
    })).toBe('Food & dining went from $450.00 to $500.00.');
  });
});

describe('describeTargetProgress', () => {
  const base = {
    month: '2026-09', target: 5000, spentToDate: 2400, remaining: 2600,
    expectedToDate: 1000, paceDifference: 1400, projectionMaturity: 'developing' as const,
  };

  it('states an overrun', () => {
    expect(describeTargetProgress({
      ...base, projectedMonthEndSpending: 6000, projectedDifference: 1000, verdict: 'over',
    })).toBe('Tracking to $6,000.00 against your $5,000.00 target — $1,000.00 over.');
  });

  it('states being on track', () => {
    expect(describeTargetProgress({
      ...base, projectedMonthEndSpending: 5000, projectedDifference: 0, verdict: 'on_track',
    })).toBe('Tracking to $5,000.00 against your $5,000.00 target — on track.');
  });
});

function safeToSpend(overrides: Partial<SafeToSpend> = {}): SafeToSpend {
  return {
    status: 'ready',
    asOfDate: '2026-09-06',
    throughDate: '2026-09-30',
    currency: 'USD',
    cashBasis: 'available',
    cashOnHand: 4000,
    cashAccountCount: 1,
    excludedCashAccountCount: 0,
    unassignedCashAccountCount: 0,
    billsDue: 2180,
    pendingOutflow: 250,
    buffer: 0,
    amount: 1570,
    deductions: [],
    pendingReflectedInBalance: false,
    blockers: [],
    warning: null,
    ...overrides,
  };
}

describe('describeSafeToSpend', () => {
  it('names every deduction behind the figure', () => {
    expect(describeSafeToSpend(safeToSpend())).toBe(
      'From $4,000.00 in cash, after $2,180.00 in bills due by Sep 30 and $250.00 pending.'
    );
  });

  it('includes the buffer as a third clause', () => {
    expect(describeSafeToSpend(safeToSpend({ buffer: 250 }))).toBe(
      'From $4,000.00 in cash, after $2,180.00 in bills due by Sep 30, $250.00 pending, and your $250.00 buffer.'
    );
  });

  it('says so plainly when nothing is committed', () => {
    expect(describeSafeToSpend(safeToSpend({ billsDue: 0, pendingOutflow: 0 }))).toBe(
      'From $4,000.00 in cash, with nothing else committed before Sep 30.'
    );
  });

  it('shows the server warning instead of a figure when unavailable', () => {
    expect(describeSafeToSpend(safeToSpend({
      status: 'unavailable',
      amount: null,
      cashOnHand: null,
      billsDue: null,
      pendingOutflow: null,
      warning: 'Cash balances are older than a successful sync, so this figure is withheld.',
    }))).toBe('Cash balances are older than a successful sync, so this figure is withheld.');
  });
});
