import type { NormalizedTransaction } from './financial';

export type YearOverYearComparison = {
  status: 'comparable' | 'not_comparable' | 'unavailable';
  currentPeriod: { startDate: string; endDate: string };
  previousPeriod: { startDate: string; endDate: string };
  currentSpending: number;
  previousSpending: number;
  difference: number;
  percentageChange: number | null;
  addedAccountCount: number;
  removedAccountCount: number;
};

function priorYearDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function periodActivity(
  transactions: readonly NormalizedTransaction[],
  startDate: string,
  endDate: string
): { spending: number; accountIds: Set<string> } {
  let spending = 0;
  const accountIds = new Set<string>();
  for (const transaction of transactions) {
    if (
      transaction.removed || transaction.pending || !transaction.countsTowardSpending ||
      transaction.normalizedDate < startDate || transaction.normalizedDate > endDate
    ) continue;
    spending += transaction.spendingAdjustment;
    accountIds.add(transaction.accountId);
  }
  return { spending, accountIds };
}

export function buildYearOverYearComparison(input: {
  transactions: readonly NormalizedTransaction[];
  asOfDate: string;
}): YearOverYearComparison {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) throw new Error('A valid as-of date is required.');
  const currentPeriod = { startDate: `${input.asOfDate.slice(0, 7)}-01`, endDate: input.asOfDate };
  const previousPeriod = {
    startDate: `${Number(input.asOfDate.slice(0, 4)) - 1}-${input.asOfDate.slice(5, 7)}-01`,
    endDate: priorYearDate(input.asOfDate),
  };
  const current = periodActivity(input.transactions, currentPeriod.startDate, currentPeriod.endDate);
  const previous = periodActivity(input.transactions, previousPeriod.startDate, previousPeriod.endDate);
  const addedAccountCount = [...current.accountIds].filter(id => !previous.accountIds.has(id)).length;
  const removedAccountCount = [...previous.accountIds].filter(id => !current.accountIds.has(id)).length;
  const difference = current.spending - previous.spending;
  const status = previous.accountIds.size === 0
    ? 'unavailable'
    : addedAccountCount === 0 && removedAccountCount === 0
      ? 'comparable'
      : 'not_comparable';

  return {
    status,
    currentPeriod,
    previousPeriod,
    currentSpending: current.spending,
    previousSpending: previous.spending,
    difference,
    percentageChange: previous.spending !== 0 ? (difference / previous.spending) * 100 : null,
    addedAccountCount,
    removedAccountCount,
  };
}
