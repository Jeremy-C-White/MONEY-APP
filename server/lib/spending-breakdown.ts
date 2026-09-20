import type { NormalizedTransaction } from './financial';
import { getEffectiveCategory } from './aggregations';
import { getMerchantFamily } from './merchant-families';
import { resolveInsightPeriod, type InsightPeriod } from './insight-periods';

export type DateRange = { startDate: string; endDate: string };

export type SpendingBreakdownRow = {
  currentSpending: number;
  previousSpending: number | null;
  difference: number | null;
  percentageChange: number | null;
  transactionCount: number;
};

export type SpendingBreakdownReport = {
  period: InsightPeriod;
  currentPeriod: DateRange;
  previousComparablePeriod: DateRange;
  categories: Array<SpendingBreakdownRow & {
    category: string;
    householdLabel: string | null;
    sourceCategories: string[];
    walmart: { spending: number; transactionCount: number } | null;
    percentage: number;
  }>;
  merchants: Array<SpendingBreakdownRow & { merchant: string }>;
};

export const resolveSpendingPeriod = resolveInsightPeriod;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentageChange(current: number, previous: number): number | null {
  return previous !== 0 ? ((current - previous) / previous) * 100 : null;
}

type Bucket = { spending: number; count: number };
type CategoryBucket = Bucket & {
  category: string;
  householdLabel: string | null;
  sourceCategories: Set<string>;
  walmartSpending: number;
  walmartCount: number;
};
type LabelAwareTransaction = NormalizedTransaction & { householdLabel?: string | null };

function addToBucket(map: Map<string, Bucket>, key: string, amount: number) {
  const bucket = map.get(key) || { spending: 0, count: 0 };
  bucket.spending += amount;
  bucket.count += 1;
  map.set(key, bucket);
}

function addToCategoryBucket(
  map: Map<string, CategoryBucket>,
  key: string,
  category: string,
  householdLabel: string | null,
  amount: number,
  isWalmart: boolean
) {
  const bucket = map.get(key) || {
    spending: 0,
    count: 0,
    category,
    householdLabel,
    sourceCategories: new Set<string>(),
    walmartSpending: 0,
    walmartCount: 0,
  };
  bucket.spending += amount;
  bucket.count += 1;
  bucket.sourceCategories.add(category);
  if (isWalmart) {
    bucket.walmartSpending += amount;
    bucket.walmartCount += 1;
  }
  map.set(key, bucket);
}

function inRange(transaction: NormalizedTransaction, range: DateRange): boolean {
  return transaction.normalizedDate >= range.startDate && transaction.normalizedDate <= range.endDate;
}

export function buildSpendingBreakdown(input: {
  transactions: readonly LabelAwareTransaction[];
  period: InsightPeriod;
  asOfDate: string;
}): SpendingBreakdownReport {
  const ranges = resolveInsightPeriod(input.period, input.asOfDate);
  const currentCategories = new Map<string, CategoryBucket>();
  const previousCategories = new Map<string, CategoryBucket>();
  const currentMerchants = new Map<string, Bucket>();
  const previousMerchants = new Map<string, Bucket>();
  let previousHasLedgerData = false;

  for (const transaction of input.transactions) {
    if (transaction.removed || transaction.pending) continue;
    const isPrevious = inRange(transaction, ranges.previousComparablePeriod);
    if (isPrevious) previousHasLedgerData = true;
    if (!transaction.countsTowardSpending) continue;

    const category = getEffectiveCategory(transaction);
    const householdLabel = transaction.householdLabel?.trim() || null;
    const categoryKey = householdLabel ? `household:${householdLabel.toLowerCase()}` : `plaid:${category}`;
    const merchant = getMerchantFamily(transaction.normalizedMerchant, transaction.name);
    if (inRange(transaction, ranges.currentPeriod)) {
      addToCategoryBucket(
        currentCategories,
        categoryKey,
        category,
        householdLabel,
        transaction.spendingAdjustment,
        merchant === 'Walmart'
      );
      addToBucket(currentMerchants, merchant, transaction.spendingAdjustment);
    } else if (isPrevious) {
      addToCategoryBucket(
        previousCategories,
        categoryKey,
        category,
        householdLabel,
        transaction.spendingAdjustment,
        merchant === 'Walmart'
      );
      addToBucket(previousMerchants, merchant, transaction.spendingAdjustment);
    }
  }

  const totalSpending = [...currentCategories.values()].reduce((total, bucket) => total + bucket.spending, 0);
  const buildRows = (current: Map<string, Bucket>, previous: Map<string, Bucket>) => (
    [...current.entries()]
      .filter(([, bucket]) => bucket.spending > 0)
      .map(([key, bucket]) => {
        const currentSpending = roundCurrency(bucket.spending);
        const previousSpending = previousHasLedgerData
          ? roundCurrency(previous.get(key)?.spending || 0)
          : null;
        const difference = previousSpending === null
          ? null
          : roundCurrency(currentSpending - previousSpending);
        return {
          key,
          currentSpending,
          previousSpending,
          difference,
          percentageChange: previousSpending === null ? null : percentageChange(currentSpending, previousSpending),
          transactionCount: bucket.count,
        };
      })
      .sort((left, right) => right.currentSpending - left.currentSpending || left.key.localeCompare(right.key))
  );

  return {
    period: input.period,
    ...ranges,
    categories: buildRows(currentCategories, previousCategories).map(row => {
      const bucket = currentCategories.get(row.key)!;
      return {
        category: bucket.category,
        householdLabel: bucket.householdLabel,
        sourceCategories: [...bucket.sourceCategories].sort(),
        walmart: bucket.walmartCount > 0 ? {
          spending: roundCurrency(bucket.walmartSpending),
          transactionCount: bucket.walmartCount,
        } : null,
        currentSpending: row.currentSpending,
        previousSpending: row.previousSpending,
        difference: row.difference,
        percentageChange: row.percentageChange,
        transactionCount: row.transactionCount,
        percentage: totalSpending > 0 ? row.currentSpending / totalSpending : 0,
      };
    }),
    merchants: buildRows(currentMerchants, previousMerchants).map(row => ({
      merchant: row.key,
      currentSpending: row.currentSpending,
      previousSpending: row.previousSpending,
      difference: row.difference,
      percentageChange: row.percentageChange,
      transactionCount: row.transactionCount,
    })),
  };
}
