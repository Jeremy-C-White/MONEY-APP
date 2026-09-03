import type { NormalizedTransaction } from './financial';
import { aggregateCategories } from './aggregations';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';
import { getDaysInMonth } from './time';

export type InsightPeriod = {
  startDate: string;
  endDate: string;
  spending: number;
  income: number;
  netCashFlow: number;
};

export type CategorySpendingChange = {
  category: string;
  currentSpending: number;
  previousSpending: number;
  difference: number;
  percentageChange: number | null;
};

export type HouseholdInsights = {
  asOfDate: string;
  weekly: {
    current: InsightPeriod;
    previousComparable: InsightPeriod;
    previousFull: InsightPeriod;
    pendingSpending: number;
    spendingDifference: number;
    spendingPercentageChange: number | null;
  };
  monthly: {
    current: InsightPeriod;
    previousComparable: InsightPeriod;
    previousFull: InsightPeriod;
    spendingDifference: number;
    spendingPercentageChange: number | null;
    categoryChanges: CategorySpendingChange[];
  };
  forecast: {
    month: string;
    daysElapsed: number;
    daysRemaining: number;
    maturity: 'early' | 'developing' | 'established';
    postedSpending: number;
    pendingSpending: number;
    confirmedRecurringMonthly: number;
    confirmedRecurringRemaining: number;
    variableSpendingToDate: number;
    projectedVariableRemaining: number;
    projectedMonthEndSpending: number;
  };
};

function parseCivilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('asOfDate must be a valid YYYY-MM-DD civil date.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('asOfDate must be a valid YYYY-MM-DD civil date.');
  }
  return date;
}

function formatCivilDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(value: string, days: number): string {
  const date = parseCivilDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatCivilDate(date);
}

function getMonday(value: string): string {
  const date = parseCivilDate(value);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return formatCivilDate(date);
}

function getPreviousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return formatCivilDate(new Date(Date.UTC(year, monthNumber - 2, 1))).slice(0, 7);
}

function postedWithin(
  transactions: NormalizedTransaction[],
  startDate: string,
  endDate: string
): NormalizedTransaction[] {
  return transactions.filter(transaction => (
    !transaction.removed &&
    !transaction.pending &&
    transaction.normalizedDate >= startDate &&
    transaction.normalizedDate <= endDate
  ));
}

function periodTotals(
  transactions: NormalizedTransaction[],
  startDate: string,
  endDate: string
): InsightPeriod {
  let spending = 0;
  let income = 0;
  for (const transaction of postedWithin(transactions, startDate, endDate)) {
    if (transaction.countsTowardSpending) spending += transaction.spendingAdjustment;
    if (transaction.countsTowardIncome) income += transaction.incomeAdjustment;
  }
  return { startDate, endDate, spending, income, netCashFlow: income - spending };
}

function pendingSpendingWithin(
  transactions: NormalizedTransaction[],
  startDate: string,
  endDate: string
): number {
  return transactions.reduce((total, transaction) => (
    !transaction.removed &&
    transaction.pending &&
    transaction.countsTowardSpending &&
    transaction.normalizedDate >= startDate &&
    transaction.normalizedDate <= endDate
      ? total + transaction.spendingAdjustment
      : total
  ), 0);
}

function percentageChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

function buildCategoryChanges(
  currentTransactions: NormalizedTransaction[],
  previousTransactions: NormalizedTransaction[]
): CategorySpendingChange[] {
  const current = new Map(
    aggregateCategories(currentTransactions).map(category => [category.category, category.netSpending])
  );
  const previous = new Map(
    aggregateCategories(previousTransactions).map(category => [category.category, category.netSpending])
  );
  const categories = new Set([...current.keys(), ...previous.keys()]);

  return [...categories]
    .map(category => {
      const currentSpending = current.get(category) || 0;
      const previousSpending = previous.get(category) || 0;
      const difference = currentSpending - previousSpending;
      return {
        category,
        currentSpending,
        previousSpending,
        difference,
        percentageChange: percentageChange(currentSpending, previousSpending),
      };
    })
    .filter(change => Math.abs(change.difference) > Number.EPSILON)
    .sort((a, b) => (
      Math.abs(b.difference) - Math.abs(a.difference) ||
      a.category.localeCompare(b.category)
    ));
}

function normalizeMerchant(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function seasonIncludesMonth(
  obligation: ReviewedRecurringObligation,
  month: number
): boolean {
  if (obligation.status === 'confirmed') return true;
  if (
    obligation.status !== 'seasonal' ||
    obligation.seasonStartMonth == null ||
    obligation.seasonEndMonth == null
  ) return false;
  return obligation.seasonStartMonth <= obligation.seasonEndMonth
    ? month >= obligation.seasonStartMonth && month <= obligation.seasonEndMonth
    : month >= obligation.seasonStartMonth || month <= obligation.seasonEndMonth;
}

function projectionMaturity(dayOfMonth: number): 'early' | 'developing' | 'established' {
  if (dayOfMonth <= 7) return 'early';
  if (dayOfMonth <= 14) return 'developing';
  return 'established';
}

function spendingForMerchant(
  transactions: NormalizedTransaction[],
  merchant: string,
  pending: boolean
): number {
  const merchantKey = normalizeMerchant(merchant);
  return transactions.reduce((total, transaction) => (
    !transaction.removed &&
    transaction.pending === pending &&
    transaction.countsTowardSpending &&
    transaction.spendingAdjustment > 0 &&
    normalizeMerchant(transaction.normalizedMerchant) === merchantKey
      ? total + transaction.spendingAdjustment
      : total
  ), 0);
}

export function buildHouseholdInsights(
  transactions: NormalizedTransaction[],
  recurringObligations: ReviewedRecurringObligation[],
  asOfDate: string
): HouseholdInsights {
  parseCivilDate(asOfDate);

  const currentWeekStart = getMonday(asOfDate);
  const elapsedWeekDays = Math.floor(
    (parseCivilDate(asOfDate).getTime() - parseCivilDate(currentWeekStart).getTime()) / 86_400_000
  ) + 1;
  const previousWeekStart = addDays(currentWeekStart, -7);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const previousComparableEnd = addDays(previousWeekStart, elapsedWeekDays - 1);

  const currentWeek = periodTotals(transactions, currentWeekStart, asOfDate);
  const previousWeekComparable = periodTotals(
    transactions,
    previousWeekStart,
    previousComparableEnd
  );
  const previousWeekFull = periodTotals(transactions, previousWeekStart, previousWeekEnd);

  const currentMonth = asOfDate.slice(0, 7);
  const previousMonth = getPreviousMonth(currentMonth);
  const currentMonthStart = `${currentMonth}-01`;
  const previousMonthStart = `${previousMonth}-01`;
  const previousMonthEnd = `${previousMonth}-${String(getDaysInMonth(previousMonth)).padStart(2, '0')}`;
  const comparablePreviousDay = Math.min(
    Number(asOfDate.slice(8, 10)),
    getDaysInMonth(previousMonth)
  );
  const previousComparableEndDate = `${previousMonth}-${String(comparablePreviousDay).padStart(2, '0')}`;

  const currentMonthTransactions = postedWithin(transactions, currentMonthStart, asOfDate);
  const previousComparableTransactions = postedWithin(
    transactions,
    previousMonthStart,
    previousComparableEndDate
  );
  const currentMonthTotals = periodTotals(transactions, currentMonthStart, asOfDate);
  const previousMonthComparable = periodTotals(
    transactions,
    previousMonthStart,
    previousComparableEndDate
  );
  const previousMonthFull = periodTotals(transactions, previousMonthStart, previousMonthEnd);

  const daysElapsed = Number(asOfDate.slice(8, 10));
  const daysRemaining = getDaysInMonth(currentMonth) - daysElapsed;
  const pendingMonthSpending = pendingSpendingWithin(
    transactions,
    currentMonthStart,
    asOfDate
  );
  const activeObligations = recurringObligations.filter(obligation => (
    seasonIncludesMonth(obligation, Number(currentMonth.slice(5, 7)))
  ));

  let confirmedRecurringMonthly = 0;
  let confirmedRecurringRemaining = 0;
  let matchedRecurringPosted = 0;
  for (const obligation of activeObligations) {
    const posted = spendingForMerchant(currentMonthTransactions, obligation.merchant, false);
    const pending = spendingForMerchant(
      transactions.filter(transaction => (
        transaction.normalizedDate >= currentMonthStart && transaction.normalizedDate <= asOfDate
      )),
      obligation.merchant,
      true
    );
    confirmedRecurringMonthly += obligation.expectedMonthlyAmount;
    matchedRecurringPosted += posted;
    confirmedRecurringRemaining += Math.max(
      obligation.expectedMonthlyAmount - posted - pending,
      0
    );
  }

  const variableSpendingToDate = Math.max(
    currentMonthTotals.spending - matchedRecurringPosted,
    0
  );
  const projectedVariableRemaining = daysElapsed > 0
    ? (variableSpendingToDate / daysElapsed) * daysRemaining
    : 0;

  return {
    asOfDate,
    weekly: {
      current: currentWeek,
      previousComparable: previousWeekComparable,
      previousFull: previousWeekFull,
      pendingSpending: pendingSpendingWithin(transactions, currentWeekStart, asOfDate),
      spendingDifference: currentWeek.spending - previousWeekComparable.spending,
      spendingPercentageChange: percentageChange(
        currentWeek.spending,
        previousWeekComparable.spending
      ),
    },
    monthly: {
      current: currentMonthTotals,
      previousComparable: previousMonthComparable,
      previousFull: previousMonthFull,
      spendingDifference: currentMonthTotals.spending - previousMonthComparable.spending,
      spendingPercentageChange: percentageChange(
        currentMonthTotals.spending,
        previousMonthComparable.spending
      ),
      categoryChanges: buildCategoryChanges(
        currentMonthTransactions,
        previousComparableTransactions
      ),
    },
    forecast: {
      month: currentMonth,
      daysElapsed,
      daysRemaining,
      maturity: projectionMaturity(daysElapsed),
      postedSpending: currentMonthTotals.spending,
      pendingSpending: pendingMonthSpending,
      confirmedRecurringMonthly,
      confirmedRecurringRemaining,
      variableSpendingToDate,
      projectedVariableRemaining,
      projectedMonthEndSpending:
        currentMonthTotals.spending +
        pendingMonthSpending +
        confirmedRecurringRemaining +
        projectedVariableRemaining,
    },
  };
}
