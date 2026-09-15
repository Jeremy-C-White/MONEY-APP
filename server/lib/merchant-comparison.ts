import type { NormalizedTransaction } from './financial';

export type MerchantComparison = {
  merchant: string;
  currentSpending: number;
  previousSpending: number;
  difference: number;
  percentageChange: number | null;
  transactionCount: number;
  isNew: boolean;
};

export type MerchantComparisonReport = {
  asOfDate: string;
  currentPeriod: { startDate: string; endDate: string };
  previousComparablePeriod: { startDate: string; endDate: string };
  merchants: MerchantComparison[];
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function previousComparableEnd(asOfDate: string): string {
  const [year, month, day] = asOfDate.split('-').map(Number);
  const previousMonth = new Date(Date.UTC(year, month - 2, 1));
  const finalDay = new Date(Date.UTC(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth() + 1,
    0
  )).getUTCDate();
  return `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, finalDay)).padStart(2, '0')}`;
}

function aggregate(
  transactions: readonly NormalizedTransaction[],
  startDate: string,
  endDate: string
): Map<string, { spending: number; count: number }> {
  const merchants = new Map<string, { spending: number; count: number }>();
  for (const transaction of transactions) {
    if (
      transaction.removed ||
      transaction.pending ||
      !transaction.countsTowardSpending ||
      transaction.normalizedDate < startDate ||
      transaction.normalizedDate > endDate
    ) continue;
    const merchant = transaction.normalizedMerchant.trim() || transaction.name.trim() || 'Unknown';
    const current = merchants.get(merchant) || { spending: 0, count: 0 };
    current.spending += transaction.spendingAdjustment;
    current.count += 1;
    merchants.set(merchant, current);
  }
  return merchants;
}

export function buildMerchantComparison(input: {
  transactions: readonly NormalizedTransaction[];
  asOfDate: string;
  limit?: number;
}): MerchantComparisonReport {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) {
    throw new Error('A valid as-of date is required.');
  }
  const currentStart = `${input.asOfDate.slice(0, 7)}-01`;
  const previousEnd = previousComparableEnd(input.asOfDate);
  const previousStart = `${previousEnd.slice(0, 7)}-01`;
  const current = aggregate(input.transactions, currentStart, input.asOfDate);
  const previous = aggregate(input.transactions, previousStart, previousEnd);
  const limit = input.limit ?? 10;

  const merchants = [...current.entries()]
    .filter(([, values]) => values.spending > 0)
    .map(([merchant, values]) => {
      const previousSpending = roundCurrency(previous.get(merchant)?.spending || 0);
      const currentSpending = roundCurrency(values.spending);
      const difference = roundCurrency(currentSpending - previousSpending);
      return {
        merchant,
        currentSpending,
        previousSpending,
        difference,
        percentageChange: previousSpending !== 0 ? (difference / previousSpending) * 100 : null,
        transactionCount: values.count,
        isNew: previousSpending === 0,
      };
    })
    .sort((left, right) => (
      right.currentSpending - left.currentSpending || left.merchant.localeCompare(right.merchant)
    ))
    .slice(0, limit);

  return {
    asOfDate: input.asOfDate,
    currentPeriod: { startDate: currentStart, endDate: input.asOfDate },
    previousComparablePeriod: { startDate: previousStart, endDate: previousEnd },
    merchants,
  };
}
