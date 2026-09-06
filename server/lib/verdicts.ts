import type { CategorySpendingChange } from './household-insights';
import type { SpendingTargetProgress } from './household-plan';

/**
 * Verdicts state the conclusion a set of figures supports, so the Overview can
 * say what happened rather than leaving the reader to work it out.
 *
 * This module decides *what is true*. It deliberately produces no prose: the
 * sentences are assembled on the client, where currency formatting already
 * lives. Every claim here is derived from figures the aggregation already
 * computed — nothing new is inferred about the money.
 */

export type VerdictTone = 'positive' | 'caution' | 'neutral';

export type MonthProgressVerdict = {
  month: string;
  dayOfMonth: number;
  daysInMonth: number;
  spending: number;
  income: number;
  netCashFlow: number;
  tone: VerdictTone;
};

export type CompletedMonthRank = 'best' | 'tightest' | 'middle';

export type CompletedMonthVerdict = {
  month: string;
  netCashFlow: number;
  rank: CompletedMonthRank;
  comparedMonthCount: number;
  previousMonth: string | null;
  previousNetCashFlow: number | null;
  difference: number | null;
  tone: VerdictTone;
};

export type PacingDirection = 'ahead' | 'behind' | 'level';

export type PacingVerdict = {
  dayOfMonth: number;
  daysInMonth: number;
  previousMonthToDateSpending: number;
  spendingDifference: number;
  spendingPercentageChange: number | null;
  direction: PacingDirection;
  driver: { category: string; difference: number; share: number } | null;
  tone: VerdictTone;
};

export type CategoryMovement = 'new' | 'up' | 'down' | 'stopped';

export type CategoryDriverVerdict = {
  category: string;
  currentSpending: number;
  previousSpending: number;
  difference: number;
  percentageChange: number | null;
  movement: CategoryMovement;
  tone: VerdictTone;
};

export type OverviewVerdicts = {
  monthProgress: MonthProgressVerdict;
  lastCompletedMonth: CompletedMonthVerdict | null;
  pacing: PacingVerdict | null;
  categoryDrivers: CategoryDriverVerdict[];
  targetProgress: SpendingTargetProgress | null;
};

export type TrendMonth = {
  month: string;
  income: number;
  spending: number;
  netCashFlow: number;
};

/** Below this, a month-to-date difference is noise rather than a direction. */
const PACING_LEVEL_FLOOR = 25;
const PACING_LEVEL_RATIO = 0.02;
/** A single category is only named as "the driver" when it explains this much. */
const DRIVER_MINIMUM_SHARE = 0.4;
const MAX_CATEGORY_DRIVERS = 3;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildLastCompletedMonthVerdict(
  trends: TrendMonth[],
  currentMonth: string
): CompletedMonthVerdict | null {
  const completed = trends
    .filter(point => point.month < currentMonth)
    .sort((left, right) => left.month.localeCompare(right.month));
  const latest = completed[completed.length - 1];
  if (!latest) return null;

  const previous = completed[completed.length - 2] || null;
  // A "best in N" claim needs enough completed months to be worth making.
  const rank: CompletedMonthRank = completed.length < 3
    ? 'middle'
    : completed.every(point => point === latest || point.netCashFlow < latest.netCashFlow)
      ? 'best'
      : completed.every(point => point === latest || point.netCashFlow > latest.netCashFlow)
        ? 'tightest'
        : 'middle';

  return {
    month: latest.month,
    netCashFlow: roundCurrency(latest.netCashFlow),
    rank,
    comparedMonthCount: completed.length,
    previousMonth: previous?.month || null,
    previousNetCashFlow: previous ? roundCurrency(previous.netCashFlow) : null,
    difference: previous ? roundCurrency(latest.netCashFlow - previous.netCashFlow) : null,
    tone: latest.netCashFlow > 0 ? 'positive' : latest.netCashFlow < 0 ? 'caution' : 'neutral',
  };
}

function buildPacingVerdict(
  pacing: {
    dayOfMonth: number;
    daysInMonth: number;
    previousMonthToDateSpending: number;
    spendingDifference: number;
    spendingPercentageChange: number | null;
  },
  categoryChanges: CategorySpendingChange[]
): PacingVerdict {
  const tolerance = Math.max(
    PACING_LEVEL_FLOOR,
    Math.abs(pacing.previousMonthToDateSpending) * PACING_LEVEL_RATIO
  );
  const direction: PacingDirection = pacing.spendingDifference > tolerance
    ? 'ahead'
    : pacing.spendingDifference < -tolerance
      ? 'behind'
      : 'level';

  // Only name a driver that moved the same way the total did, and only when it
  // explains enough of the move to justify the word "mostly".
  const magnitude = Math.abs(pacing.spendingDifference);
  const candidate = categoryChanges
    .filter(change => (
      direction === 'ahead' ? change.difference > 0
        : direction === 'behind' ? change.difference < 0
          : false
    ))
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference))[0];
  const share = candidate && magnitude > 0
    ? Math.abs(candidate.difference) / magnitude
    : 0;

  return {
    dayOfMonth: pacing.dayOfMonth,
    daysInMonth: pacing.daysInMonth,
    previousMonthToDateSpending: roundCurrency(pacing.previousMonthToDateSpending),
    spendingDifference: roundCurrency(pacing.spendingDifference),
    spendingPercentageChange: pacing.spendingPercentageChange,
    direction,
    driver: candidate && share >= DRIVER_MINIMUM_SHARE
      ? {
          category: candidate.category,
          difference: roundCurrency(candidate.difference),
          share: Math.round(Math.min(share, 1) * 100) / 100,
        }
      : null,
    tone: direction === 'ahead' ? 'caution' : direction === 'behind' ? 'positive' : 'neutral',
  };
}

function categoryMovement(change: CategorySpendingChange): CategoryMovement {
  if (change.previousSpending === 0 && change.currentSpending > 0) return 'new';
  if (change.currentSpending === 0 && change.previousSpending > 0) return 'stopped';
  return change.difference > 0 ? 'up' : 'down';
}

function buildCategoryDrivers(
  categoryChanges: CategorySpendingChange[]
): CategoryDriverVerdict[] {
  return categoryChanges
    .filter(change => change.difference !== 0)
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference))
    .slice(0, MAX_CATEGORY_DRIVERS)
    .map(change => {
      const movement = categoryMovement(change);
      return {
        category: change.category,
        currentSpending: roundCurrency(change.currentSpending),
        previousSpending: roundCurrency(change.previousSpending),
        difference: roundCurrency(change.difference),
        percentageChange: change.percentageChange,
        movement,
        tone: movement === 'up' || movement === 'new'
          ? 'caution' as const
          : 'positive' as const,
      };
    });
}

export function buildOverviewVerdicts(input: {
  currentMonth: { month: string; spending: number; income: number; netCashFlow: number };
  pacing: {
    dayOfMonth: number;
    daysInMonth: number;
    previousMonthToDateSpending: number;
    spendingDifference: number;
    spendingPercentageChange: number | null;
  };
  trends: TrendMonth[];
  categoryChanges: CategorySpendingChange[];
  targetProgress: SpendingTargetProgress | null;
}): OverviewVerdicts {
  return {
    monthProgress: {
      month: input.currentMonth.month,
      dayOfMonth: input.pacing.dayOfMonth,
      daysInMonth: input.pacing.daysInMonth,
      spending: roundCurrency(input.currentMonth.spending),
      income: roundCurrency(input.currentMonth.income),
      netCashFlow: roundCurrency(input.currentMonth.netCashFlow),
      tone: input.currentMonth.netCashFlow > 0
        ? 'positive'
        : input.currentMonth.netCashFlow < 0 ? 'caution' : 'neutral',
    },
    lastCompletedMonth: buildLastCompletedMonthVerdict(input.trends, input.currentMonth.month),
    pacing: buildPacingVerdict(input.pacing, input.categoryChanges),
    categoryDrivers: buildCategoryDrivers(input.categoryChanges),
    targetProgress: input.targetProgress,
  };
}
