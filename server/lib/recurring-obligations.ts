import type { NormalizedTransaction } from './financial';

export type RecurringCadence = 'weekly' | 'biweekly' | 'monthly';
export type RecurringConfidence = 'high' | 'medium';

export type LikelyRecurringObligation = {
  merchant: string;
  category: string;
  cadence: RecurringCadence;
  confidence: RecurringConfidence;
  typicalCharge: number;
  estimatedMonthlyAmount: number;
  occurrenceCount: number;
  lastChargeDate: string;
};

export type RecurringObligationsReport = {
  obligations: LikelyRecurringObligation[];
  estimatedMonthlyTotal: number;
  analyzedThrough: string | null;
};

type Candidate = {
  merchant: string;
  transactions: NormalizedTransaction[];
};

type CadenceDefinition = {
  cadence: RecurringCadence;
  minimumOccurrences: number;
  minimumDays: number;
  maximumDays: number;
  monthlyMultiplier: number;
  recentWithinDays: number;
};

const CADENCES: CadenceDefinition[] = [
  {
    cadence: 'weekly',
    minimumOccurrences: 6,
    minimumDays: 5,
    maximumDays: 10,
    monthlyMultiplier: 52 / 12,
    recentWithinDays: 21,
  },
  {
    cadence: 'biweekly',
    minimumOccurrences: 4,
    minimumDays: 11,
    maximumDays: 18,
    monthlyMultiplier: 26 / 12,
    recentWithinDays: 35,
  },
  {
    cadence: 'monthly',
    minimumOccurrences: 3,
    minimumDays: 20,
    maximumDays: 45,
    monthlyMultiplier: 1,
    recentWithinDays: 62,
  },
];

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function dateToUtcMilliseconds(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const milliseconds = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function daysBetween(earlier: string, later: string): number | null {
  const start = dateToUtcMilliseconds(earlier);
  const end = dateToUtcMilliseconds(later);
  if (start == null || end == null) return null;
  return Math.round((end - start) / 86_400_000);
}

function mostCommonCategory(transactions: NormalizedTransaction[]): string {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    const category = transaction.normalizedCategory || 'UNCATEGORIZED';
    counts.set(category, (counts.get(category) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || 'UNCATEGORIZED';
}

function findCadence(
  intervals: number[],
  occurrenceCount: number
): { definition: CadenceDefinition; matchRatio: number } | null {
  let best: { definition: CadenceDefinition; matchRatio: number } | null = null;

  for (const definition of CADENCES) {
    if (occurrenceCount < definition.minimumOccurrences) continue;
    const matching = intervals.filter(interval => (
      interval >= definition.minimumDays && interval <= definition.maximumDays
    )).length;
    const matchRatio = intervals.length > 0 ? matching / intervals.length : 0;
    if (matchRatio < 0.6) continue;
    if (!best || matchRatio > best.matchRatio) best = { definition, matchRatio };
  }

  return best;
}

function buildCandidate(
  candidate: Candidate,
  analyzedThrough: string
): LikelyRecurringObligation | null {
  const transactions = candidate.transactions
    .slice()
    .sort((a, b) => a.normalizedDate.localeCompare(b.normalizedDate));
  const uniqueDates = [...new Set(transactions.map(transaction => transaction.normalizedDate))];
  const intervals = uniqueDates.slice(1).flatMap((date, index) => {
    const interval = daysBetween(uniqueDates[index], date);
    return interval != null && interval > 0 ? [interval] : [];
  });
  const cadence = findCadence(intervals, uniqueDates.length);
  if (!cadence) return null;

  const lastChargeDate = uniqueDates[uniqueDates.length - 1];
  const daysSinceLastCharge = daysBetween(lastChargeDate, analyzedThrough);
  if (
    daysSinceLastCharge == null ||
    daysSinceLastCharge < 0 ||
    daysSinceLastCharge > cadence.definition.recentWithinDays
  ) return null;

  const amounts = transactions
    .map(transaction => transaction.spendingAdjustment)
    .filter(amount => Number.isFinite(amount) && amount > 0);
  if (amounts.length < cadence.definition.minimumOccurrences) return null;

  const typicalCharge = median(amounts);
  if (typicalCharge <= 0) return null;
  const medianAbsoluteDeviation = median(
    amounts.map(amount => Math.abs(amount - typicalCharge))
  );
  const relativeDeviation = medianAbsoluteDeviation / typicalCharge;
  const amountTolerance = Math.max(2, typicalCharge * 0.15);
  const stableAmountRatio = amounts.filter(amount => (
    Math.abs(amount - typicalCharge) <= amountTolerance
  )).length / amounts.length;

  // Timing alone can make an often-visited retailer look recurring. Require
  // reasonably stable charges before surfacing a merchant as an obligation.
  if (relativeDeviation > 0.2 || stableAmountRatio < 0.6) return null;

  const confidence: RecurringConfidence = (
    cadence.matchRatio >= 0.75 &&
    relativeDeviation <= 0.1 &&
    uniqueDates.length >= cadence.definition.minimumOccurrences + 1
  ) ? 'high' : 'medium';

  return {
    merchant: candidate.merchant,
    category: mostCommonCategory(transactions),
    cadence: cadence.definition.cadence,
    confidence,
    typicalCharge: roundCurrency(typicalCharge),
    estimatedMonthlyAmount: roundCurrency(
      typicalCharge * cadence.definition.monthlyMultiplier
    ),
    occurrenceCount: transactions.length,
    lastChargeDate,
  };
}

/**
 * Detects likely recurring obligations from already-normalized transactions.
 * This is a read-only analytical hint: it does not classify transactions or
 * change dashboard financial totals.
 */
export function detectLikelyRecurringObligations(
  transactions: NormalizedTransaction[]
): RecurringObligationsReport {
  const validDates = transactions
    .map(transaction => transaction.normalizedDate)
    .filter(date => dateToUtcMilliseconds(date) != null)
    .sort();
  const analyzedThrough = validDates[validDates.length - 1] || null;
  if (!analyzedThrough) {
    return { obligations: [], estimatedMonthlyTotal: 0, analyzedThrough: null };
  }

  const grouped = new Map<string, Candidate>();
  for (const transaction of transactions) {
    if (
      transaction.removed ||
      transaction.pending ||
      transaction.classification !== 'spending' ||
      !transaction.countsTowardSpending ||
      transaction.spendingAdjustment <= 0 ||
      dateToUtcMilliseconds(transaction.normalizedDate) == null
    ) continue;

    const merchant = transaction.normalizedMerchant.trim();
    if (!merchant || merchant.toLowerCase() === 'unknown') continue;
    const key = merchant.toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    const candidate = grouped.get(key) || { merchant, transactions: [] };
    candidate.transactions.push(transaction);
    grouped.set(key, candidate);
  }

  const obligations = [...grouped.values()]
    .flatMap(candidate => {
      const obligation = buildCandidate(candidate, analyzedThrough);
      return obligation ? [obligation] : [];
    })
    .sort((a, b) => (
      b.estimatedMonthlyAmount - a.estimatedMonthlyAmount ||
      a.merchant.localeCompare(b.merchant)
    ));

  return {
    obligations,
    estimatedMonthlyTotal: roundCurrency(
      obligations.reduce((total, obligation) => total + obligation.estimatedMonthlyAmount, 0)
    ),
    analyzedThrough,
  };
}
