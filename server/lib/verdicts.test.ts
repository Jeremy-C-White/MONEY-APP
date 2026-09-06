import { describe, expect, it } from 'vitest';
import type { CategorySpendingChange } from './household-insights';
import { buildOverviewVerdicts, type TrendMonth } from './verdicts';

function change(overrides: Partial<CategorySpendingChange> & Pick<CategorySpendingChange, 'category'>): CategorySpendingChange {
  const currentSpending = overrides.currentSpending ?? 0;
  const previousSpending = overrides.previousSpending ?? 0;
  return {
    category: overrides.category,
    currentSpending,
    previousSpending,
    difference: overrides.difference ?? currentSpending - previousSpending,
    percentageChange: overrides.percentageChange ?? null,
  };
}

function trend(month: string, netCashFlow: number): TrendMonth {
  return { month, income: 10000, spending: 10000 - netCashFlow, netCashFlow };
}

const basePacing = {
  dayOfMonth: 6,
  daysInMonth: 30,
  previousMonthToDateSpending: 2000,
  spendingDifference: 0,
  spendingPercentageChange: null,
};

function build(overrides: Partial<Parameters<typeof buildOverviewVerdicts>[0]> = {}) {
  return buildOverviewVerdicts({
    currentMonth: { month: '2026-09', spending: 2400, income: 5000, netCashFlow: 2600 },
    pacing: basePacing,
    trends: [],
    categoryChanges: [],
    targetProgress: null,
    ...overrides,
  });
}

describe('buildOverviewVerdicts', () => {
  it('reports the current month as in progress with its day position', () => {
    expect(build().monthProgress).toEqual({
      month: '2026-09',
      dayOfMonth: 6,
      daysInMonth: 30,
      spending: 2400,
      income: 5000,
      netCashFlow: 2600,
      tone: 'positive',
    });
  });

  it('marks a negative month as caution', () => {
    expect(build({
      currentMonth: { month: '2026-09', spending: 5400, income: 5000, netCashFlow: -400 },
    }).monthProgress.tone).toBe('caution');
  });

  it('calls the last completed month the best when it beats every other', () => {
    const verdict = build({
      trends: [
        trend('2026-04', 1200),
        trend('2026-05', 900),
        trend('2026-06', 2100),
        trend('2026-07', 1500),
        trend('2026-08', 5324),
        trend('2026-09', 2600),
      ],
    }).lastCompletedMonth;

    expect(verdict).toMatchObject({
      month: '2026-08',
      netCashFlow: 5324,
      rank: 'best',
      comparedMonthCount: 5,
      previousMonth: '2026-07',
      difference: 3824,
      tone: 'positive',
    });
  });

  it('calls the last completed month the tightest when it trails every other', () => {
    expect(build({
      trends: [trend('2026-06', 2100), trend('2026-07', 1500), trend('2026-08', -300)],
    }).lastCompletedMonth).toMatchObject({ rank: 'tightest', tone: 'caution' });
  });

  it('withholds a ranking claim with fewer than three completed months', () => {
    expect(build({
      trends: [trend('2026-07', 100), trend('2026-08', 9000)],
    }).lastCompletedMonth).toMatchObject({ rank: 'middle', comparedMonthCount: 2 });
  });

  it('returns no completed-month verdict when only the current month exists', () => {
    expect(build({ trends: [trend('2026-09', 2600)] }).lastCompletedMonth).toBeNull();
  });

  it('treats a small month-to-date difference as level', () => {
    expect(build({
      pacing: { ...basePacing, spendingDifference: 20 },
    }).pacing).toMatchObject({ direction: 'level', tone: 'neutral', driver: null });
  });

  it('names a driver only when one category explains most of the move', () => {
    const verdict = build({
      pacing: { ...basePacing, spendingDifference: 400, spendingPercentageChange: 20 },
      categoryChanges: [
        change({ category: 'HOME_IMPROVEMENT', currentSpending: 340, previousSpending: 0 }),
        change({ category: 'FOOD_AND_DRINK', currentSpending: 160, previousSpending: 100 }),
      ],
    }).pacing;

    expect(verdict).toMatchObject({
      direction: 'ahead',
      tone: 'caution',
      driver: { category: 'HOME_IMPROVEMENT', difference: 340, share: 0.85 },
    });
  });

  it('names no driver when the move is spread across categories', () => {
    expect(build({
      pacing: { ...basePacing, spendingDifference: 400 },
      categoryChanges: [
        change({ category: 'FOOD_AND_DRINK', currentSpending: 220, previousSpending: 100 }),
        change({ category: 'TRANSPORTATION', currentSpending: 200, previousSpending: 90 }),
        change({ category: 'ENTERTAINMENT', currentSpending: 110, previousSpending: 10 }),
      ],
    }).pacing?.driver).toBeNull();
  });

  it('names a downward driver when spending is behind last month', () => {
    expect(build({
      pacing: { ...basePacing, spendingDifference: -500 },
      categoryChanges: [change({ category: 'TRAVEL', currentSpending: 0, previousSpending: 480 })],
    }).pacing).toMatchObject({
      direction: 'behind',
      tone: 'positive',
      driver: { category: 'TRAVEL', difference: -480 },
    });
  });

  it('ranks category drivers by size and labels how each moved', () => {
    const drivers = build({
      categoryChanges: [
        change({ category: 'FOOD_AND_DRINK', currentSpending: 500, previousSpending: 450 }),
        change({ category: 'HOME_IMPROVEMENT', currentSpending: 6400, previousSpending: 0 }),
        change({ category: 'TRAVEL', currentSpending: 0, previousSpending: 900 }),
        change({ category: 'ENTERTAINMENT', currentSpending: 120, previousSpending: 80 }),
      ],
    }).categoryDrivers;

    expect(drivers.map(driver => [driver.category, driver.movement, driver.tone])).toEqual([
      ['HOME_IMPROVEMENT', 'new', 'caution'],
      ['TRAVEL', 'stopped', 'positive'],
      ['FOOD_AND_DRINK', 'up', 'caution'],
    ]);
  });

  it('drops categories that did not move', () => {
    expect(build({
      categoryChanges: [change({ category: 'FOOD_AND_DRINK', currentSpending: 300, previousSpending: 300 })],
    }).categoryDrivers).toEqual([]);
  });

  it('passes target progress through untouched', () => {
    const targetProgress = {
      month: '2026-09',
      target: 5000,
      spentToDate: 2400,
      remaining: 2600,
      expectedToDate: 1000,
      paceDifference: 1400,
      projectedMonthEndSpending: 6000,
      projectedDifference: 1000,
      projectionMaturity: 'developing' as const,
      verdict: 'over' as const,
    };
    expect(build({ targetProgress }).targetProgress).toBe(targetProgress);
  });
});
