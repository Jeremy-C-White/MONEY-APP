import { createHash } from 'node:crypto';
import type { NormalizedTransaction } from './financial';
import {
  deriveContributionKey,
  extractContributionReferenceTokens,
  normalizeMerchantKey,
} from './merchant-prefix';
import {
  addMonthsToMonth,
  daysBetweenCivilDates,
  getMonthForCivilDate,
  isCivilDate,
} from './time';

/**
 * How much the household is putting into each savings and investment
 * destination, how that has changed, and what share of income it represents.
 *
 * This is grouping and presentation over transactions that are already
 * classified as `investment_transfer`. Nothing here classifies anything, and
 * no figure it produces feeds the accounting bridge.
 */

export type ContributionCadence = 'weekly' | 'biweekly' | 'twice_monthly' | 'monthly' | 'irregular';
export type ContributionStatus = 'active' | 'paused' | 'ended';

export type MonthlyContribution = {
  month: string;
  amount: number;
  count: number;
};

export type ContributionStream = {
  streamKey: string;
  reference: string | null;
  totalContributed: number;
  contributionCount: number;
  firstContribution: string;
  lastContribution: string;
  typicalAmount: number;
  currentMonthlyRate: number | null;
  cadence: ContributionCadence;
  status: ContributionStatus;
};

export type ContributionRateChange = {
  previousAmount: number;
  currentAmount: number;
  changedOnMonth: string;
};

export type SavingsDestination = {
  key: string;
  destinationId: string;
  displayName: string;
  isNamed: boolean;
  totalContributed: number;
  contributionCount: number;
  firstContribution: string;
  lastContribution: string;
  monthlyAverage: number;
  currentMonthlyRate: number | null;
  cadence: ContributionCadence;
  status: ContributionStatus;
  monthlyHistory: MonthlyContribution[];
  rateChange: ContributionRateChange | null;
  /**
   * Grouping is by description prefix, so two ACH streams sharing an
   * originator collapse into one destination. When that happens this is
   * greater than 1 and `streams` carries the breakdown, so the merge is
   * visible rather than silent.
   */
  mergedStreamCount: number;
  streams: ContributionStream[];
};

export type SavingsContributionsReport = {
  asOfDate: string;
  destinations: SavingsDestination[];
  totals: {
    totalContributed: number;
    contributionCount: number;
    monthlyAverage: number;
    currentMonthlyRate: number | null;
    savingsRateOfIncome: number | null;
    incomeConsidered: number | null;
    incomeFromMonth: string | null;
  };
};

/** Months of income and contribution history the current rate is measured over. */
const RATE_WINDOW_MONTHS = 6;
/** Contributions used to establish the current typical amount. */
const RECENT_CONTRIBUTION_SAMPLE = 6;
const PAUSED_AFTER_CADENCE_MULTIPLE = 1.5;
const ENDED_AFTER_DAYS = 183;
/** A rate change smaller than this is drift, not a decision. */
const RATE_CHANGE_MINIMUM_RATIO = 0.15;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A contribution is an outflow classified as an investment transfer. Inflows
 * with the same classification are withdrawals and are not contributions.
 */
function isContribution(transaction: NormalizedTransaction): boolean {
  return (
    !transaction.removed &&
    !transaction.pending &&
    transaction.classification === 'investment_transfer' &&
    transaction.cashFlowAmount < 0 &&
    isCivilDate(transaction.normalizedDate)
  );
}

function contributionAmount(transaction: NormalizedTransaction): number {
  return Math.abs(transaction.cashFlowAmount);
}

/**
 * The grouping key. A merchant name Plaid supplied is preferred when it is
 * genuinely a name rather than the raw description; otherwise the stable ACH
 * prefix is derived. Falls back to the whole normalized description so a
 * contribution is never dropped for want of a key — money that exists must
 * appear somewhere.
 */
export function contributionKeyForTransaction(transaction: NormalizedTransaction): string {
  const merchantKey = normalizeMerchantKey(transaction.normalizedMerchant);
  const rawNameKey = normalizeMerchantKey(transaction.name);
  if (merchantKey && merchantKey !== rawNameKey) return merchantKey;

  return deriveContributionKey(transaction.name) || rawNameKey || merchantKey || 'unknown';
}

/**
 * Contributions per calendar month, excluding the first and last months, which
 * are partial and would understate the count.
 */
function completeMonthCounts(dates: string[]): number[] {
  const byMonth = new Map<string, number>();
  for (const date of dates) {
    const month = getMonthForCivilDate(date);
    if (month) byMonth.set(month, (byMonth.get(month) || 0) + 1);
  }
  const months = [...byMonth.keys()].sort();
  return months.slice(1, -1).map(month => byMonth.get(month) as number);
}

/**
 * Every 14 days and twice a calendar month produce nearly the same gaps, so
 * the gap alone cannot separate them. What does: a 14-day cycle overflows to
 * three contributions in some months, while a twice-monthly one never does.
 */
function isTwiceMonthly(dates: string[]): boolean {
  const counts = completeMonthCounts(dates);
  if (!counts.length) return false;
  return counts.every(count => count === 2);
}

function detectCadence(dates: string[]): ContributionCadence {
  const unique = [...new Set(dates)].sort();
  if (unique.length < 3) return 'irregular';

  const intervals = unique.slice(1).flatMap((date, index) => {
    const gap = daysBetweenCivilDates(unique[index], date);
    return gap != null && gap > 0 ? [gap] : [];
  });
  if (!intervals.length) return 'irregular';

  const typical = median(intervals);
  const withinBand = (low: number, high: number) =>
    intervals.filter(gap => gap >= low && gap <= high).length / intervals.length >= 0.6;

  if (typical <= 9 && withinBand(5, 9)) return 'weekly';
  if (typical <= 20 && withinBand(11, 20)) {
    return isTwiceMonthly(unique) ? 'twice_monthly' : 'biweekly';
  }
  if (typical <= 45 && withinBand(20, 45)) return 'monthly';
  return 'irregular';
}

function expectedIntervalDays(cadence: ContributionCadence): number | null {
  if (cadence === 'weekly') return 7;
  if (cadence === 'biweekly') return 14;
  if (cadence === 'twice_monthly') return 15;
  if (cadence === 'monthly') return 31;
  return null;
}

function detectStatus(
  cadence: ContributionCadence,
  lastContribution: string,
  asOfDate: string
): ContributionStatus {
  const age = daysBetweenCivilDates(lastContribution, asOfDate);
  if (age == null || age < 0) return 'active';
  if (age > ENDED_AFTER_DAYS) return 'ended';

  const expected = expectedIntervalDays(cadence);
  // Without a detected cadence there is no schedule to be late against, so an
  // irregular stream stays active until it crosses the ended threshold.
  if (expected == null) return 'active';
  return age <= expected * PAUSED_AFTER_CADENCE_MULTIPLE ? 'active' : 'paused';
}

function monthlyHistory(
  transactions: NormalizedTransaction[]
): MonthlyContribution[] {
  const byMonth = new Map<string, { amount: number; count: number }>();
  for (const transaction of transactions) {
    const month = getMonthForCivilDate(transaction.normalizedDate);
    if (!month) continue;
    const bucket = byMonth.get(month) || { amount: 0, count: 0 };
    bucket.amount += contributionAmount(transaction);
    bucket.count += 1;
    byMonth.set(month, bucket);
  }

  return [...byMonth.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([month, bucket]) => ({
      month,
      amount: roundCurrency(bucket.amount),
      count: bucket.count,
    }));
}

/**
 * The rate this destination is running at now: the recent typical contribution
 * times how often it recurs. A median over recent contributions, not a mean,
 * so a one-off lump sum does not present itself as the ongoing rate.
 */
function currentMonthlyRate(
  transactions: NormalizedTransaction[],
  cadence: ContributionCadence,
  status: ContributionStatus
): number | null {
  if (status === 'ended') return null;

  const recent = transactions
    .slice()
    .sort((left, right) => right.normalizedDate.localeCompare(left.normalizedDate))
    .slice(0, RECENT_CONTRIBUTION_SAMPLE);
  if (!recent.length) return null;

  const typical = median(recent.map(contributionAmount));
  if (!(typical > 0)) return null;

  if (cadence === 'weekly') return roundCurrency(typical * (52 / 12));
  if (cadence === 'biweekly') return roundCurrency(typical * (26 / 12));
  if (cadence === 'twice_monthly') return roundCurrency(typical * 2);
  if (cadence === 'monthly') return roundCurrency(typical);

  // Irregular: no cadence to multiply by, so report the observed monthly pace
  // over the recent window rather than inventing a schedule.
  const months = new Set(
    recent.flatMap(transaction => {
      const month = getMonthForCivilDate(transaction.normalizedDate);
      return month ? [month] : [];
    })
  ).size;
  if (!months) return null;
  const total = recent.reduce((sum, transaction) => sum + contributionAmount(transaction), 0);
  return roundCurrency(total / months);
}

/**
 * A sustained step in the per-contribution amount — the thing the owner has no
 * other way to see. Compares the typical recent contribution against the
 * typical earlier one and reports the month the new level began.
 */
function detectRateChange(
  transactions: NormalizedTransaction[]
): ContributionRateChange | null {
  const ordered = transactions
    .slice()
    .sort((left, right) => left.normalizedDate.localeCompare(right.normalizedDate));
  if (ordered.length < 4) return null;

  const amounts = ordered.map(contributionAmount);
  const recentCount = Math.min(RECENT_CONTRIBUTION_SAMPLE, Math.floor(ordered.length / 2));
  const recent = amounts.slice(-recentCount);
  const earlier = amounts.slice(0, ordered.length - recentCount);
  if (!recent.length || !earlier.length) return null;

  const currentAmount = median(recent);
  const previousAmount = median(earlier);
  if (!(previousAmount > 0) || !(currentAmount > 0)) return null;

  const ratio = Math.abs(currentAmount - previousAmount) / previousAmount;
  if (ratio < RATE_CHANGE_MINIMUM_RATIO) return null;

  // The change began at the first recent-level contribution that follows the
  // last earlier-level one.
  const tolerance = Math.max(1, currentAmount * 0.1);
  const changedIndex = ordered.findIndex((transaction, index) =>
    index >= ordered.length - recentCount &&
    Math.abs(contributionAmount(transaction) - currentAmount) <= tolerance
  );
  const changedOnMonth = getMonthForCivilDate(
    ordered[changedIndex === -1 ? ordered.length - recentCount : changedIndex].normalizedDate
  );
  if (!changedOnMonth) return null;

  return {
    previousAmount: roundCurrency(previousAmount),
    currentAmount: roundCurrency(currentAmount),
    changedOnMonth,
  };
}

/**
 * Splits a prefix group into the ACH streams underneath it. A reference token
 * that recurs across contributions identifies a stream; one that appears once
 * is a per-transaction reference and does not.
 */
function splitIntoStreams(
  key: string,
  transactions: NormalizedTransaction[],
  asOfDate: string
): ContributionStream[] {
  const referenceCounts = new Map<string, number>();
  const referencesByTransaction = new Map<string, string[]>();
  for (const transaction of transactions) {
    const references = extractContributionReferenceTokens(transaction.name);
    referencesByTransaction.set(transaction.transactionId, references);
    for (const reference of new Set(references)) {
      referenceCounts.set(reference, (referenceCounts.get(reference) || 0) + 1);
    }
  }

  const grouped = new Map<string | null, NormalizedTransaction[]>();
  for (const transaction of transactions) {
    const recurring = (referencesByTransaction.get(transaction.transactionId) || [])
      .filter(reference => (referenceCounts.get(reference) || 0) >= 2)
      .sort()[0] || null;
    const bucket = grouped.get(recurring) || [];
    bucket.push(transaction);
    grouped.set(recurring, bucket);
  }

  return [...grouped.entries()]
    .map(([reference, streamTransactions]) => {
      const dates = streamTransactions.map(transaction => transaction.normalizedDate).sort();
      const cadence = detectCadence(dates);
      const status = detectStatus(cadence, dates[dates.length - 1], asOfDate);
      return {
        streamKey: reference ? `${key}:${reference}` : key,
        reference,
        totalContributed: roundCurrency(
          streamTransactions.reduce((sum, transaction) => sum + contributionAmount(transaction), 0)
        ),
        contributionCount: streamTransactions.length,
        firstContribution: dates[0],
        lastContribution: dates[dates.length - 1],
        typicalAmount: roundCurrency(median(streamTransactions.map(contributionAmount))),
        currentMonthlyRate: currentMonthlyRate(streamTransactions, cadence, status),
        cadence,
        status,
      };
    })
    .sort((left, right) => (
      (right.currentMonthlyRate ?? -1) - (left.currentMonthlyRate ?? -1) ||
      right.totalContributed - left.totalContributed ||
      left.streamKey.localeCompare(right.streamKey)
    ));
}

/**
 * Recognized income over the same recent window the current rate is measured
 * over, so the savings rate compares like with like.
 */
function recognizedIncomeSince(
  transactions: NormalizedTransaction[],
  fromMonth: string
): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.removed || transaction.pending || !transaction.countsTowardIncome) return total;
    const month = getMonthForCivilDate(transaction.normalizedDate);
    return month && month >= fromMonth ? total + transaction.incomeAdjustment : total;
  }, 0);
}

export function buildSavingsContributions(input: {
  transactions: NormalizedTransaction[];
  displayNames: Map<string, string>;
  asOfDate: string;
}): SavingsContributionsReport {
  if (!isCivilDate(input.asOfDate)) {
    throw new Error('A valid as-of date is required.');
  }

  const contributions = input.transactions.filter(isContribution);
  const grouped = new Map<string, NormalizedTransaction[]>();
  for (const transaction of contributions) {
    const key = contributionKeyForTransaction(transaction);
    const bucket = grouped.get(key) || [];
    bucket.push(transaction);
    grouped.set(key, bucket);
  }

  const destinations: SavingsDestination[] = [...grouped.entries()].map(([key, transactions]) => {
    const dates = transactions.map(transaction => transaction.normalizedDate).sort();
    const cadence = detectCadence(dates);
    const status = detectStatus(cadence, dates[dates.length - 1], input.asOfDate);
    const history = monthlyHistory(transactions);
    const displayName = input.displayNames.get(key);
    const streams = splitIntoStreams(key, transactions, input.asOfDate);

    return {
      key,
      destinationId: buildSavingsDestinationId(key),
      displayName: displayName || key,
      isNamed: Boolean(displayName),
      totalContributed: roundCurrency(
        transactions.reduce((sum, transaction) => sum + contributionAmount(transaction), 0)
      ),
      contributionCount: transactions.length,
      firstContribution: dates[0],
      lastContribution: dates[dates.length - 1],
      monthlyAverage: history.length
        ? roundCurrency(
            history.reduce((sum, month) => sum + month.amount, 0) / history.length
          )
        : 0,
      currentMonthlyRate: currentMonthlyRate(transactions, cadence, status),
      cadence,
      status,
      monthlyHistory: history,
      rateChange: detectRateChange(transactions),
      mergedStreamCount: streams.length,
      streams,
    };
  }).sort((left, right) => (
    (right.currentMonthlyRate ?? -1) - (left.currentMonthlyRate ?? -1) ||
    right.totalContributed - left.totalContributed ||
    left.key.localeCompare(right.key)
  ));

  const totalContributed = roundCurrency(
    destinations.reduce((sum, destination) => sum + destination.totalContributed, 0)
  );
  const activeMonths = new Set(
    destinations.flatMap(destination => destination.monthlyHistory.map(month => month.month))
  ).size;
  const rates = destinations.flatMap(destination =>
    destination.currentMonthlyRate == null ? [] : [destination.currentMonthlyRate]
  );
  const currentRateTotal = rates.length
    ? roundCurrency(rates.reduce((sum, rate) => sum + rate, 0))
    : null;

  const incomeFromMonth = contributions.length
    ? addMonthsToMonth(input.asOfDate.slice(0, 7), -(RATE_WINDOW_MONTHS - 1))
    : null;
  const incomeConsidered = incomeFromMonth
    ? roundCurrency(recognizedIncomeSince(input.transactions, incomeFromMonth))
    : null;
  const monthsOfIncome = incomeFromMonth ? RATE_WINDOW_MONTHS : 0;
  const monthlyIncome = incomeConsidered && monthsOfIncome
    ? incomeConsidered / monthsOfIncome
    : null;

  return {
    asOfDate: input.asOfDate,
    destinations,
    totals: {
      totalContributed,
      contributionCount: contributions.length,
      monthlyAverage: activeMonths ? roundCurrency(totalContributed / activeMonths) : 0,
      currentMonthlyRate: currentRateTotal,
      // Null, never zero: an unknown savings rate must render as nothing.
      savingsRateOfIncome: monthlyIncome && monthlyIncome > 0 && currentRateTotal != null
        ? Math.round((currentRateTotal / monthlyIncome) * 10_000) / 10_000
        : null,
      incomeConsidered,
      incomeFromMonth,
    },
  };
}

export const MAX_DESTINATION_NAME_LENGTH = 60;

export class SavingsDestinationRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'SavingsDestinationRequestError';
  }
}

/**
 * A stable, storage-safe id for a destination. Contribution keys are merchant
 * prefixes: they carry spaces and punctuation, and could carry a slash, none
 * of which are safe in a Firestore document id or an Express route param.
 * Hashing matches how recurring obligations are keyed.
 */
export function buildSavingsDestinationId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

export function isSavingsDestinationId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
}

export function parseSavingsDestinationName(value: unknown): string {
  const displayName = typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>).displayName
    : undefined;

  if (typeof displayName !== 'string') {
    throw new SavingsDestinationRequestError('displayName must be a string.', 400);
  }
  const trimmed = displayName.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new SavingsDestinationRequestError('displayName cannot be empty.', 400);
  }
  if (trimmed.length > MAX_DESTINATION_NAME_LENGTH) {
    throw new SavingsDestinationRequestError(
      `displayName must be ${MAX_DESTINATION_NAME_LENGTH} characters or fewer.`,
      400
    );
  }
  return trimmed;
}

/** Reads a stored naming row, ignoring anything malformed rather than throwing. */
export function parseStoredSavingsDestination(
  value: unknown
): { key: string; displayName: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const key = typeof record.key === 'string' ? record.key.trim() : '';
  const displayName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  return key && displayName ? { key, displayName } : null;
}
