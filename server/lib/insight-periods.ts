export const INSIGHT_PERIODS = [
  'last_7_days',
  'last_30_days',
  'last_3_months',
  'last_12_months',
] as const;

export type InsightPeriod = typeof INSIGHT_PERIODS[number];
export type InsightGranularity = 'day' | 'week' | 'month';
export type CivilDateRange = { startDate: string; endDate: string };

function parseCivilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('A valid as-of date is required.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new Error('A valid as-of date is required.');
  return date;
}

function formatCivilDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function addCivilDays(value: string, days: number): string {
  const date = parseCivilDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatCivilDate(date);
}

export function daysBetweenCivilDates(startDate: string, endDate: string): number {
  return Math.round((parseCivilDate(endDate).getTime() - parseCivilDate(startDate).getTime()) / 86_400_000);
}

export function addCivilMonths(value: string, months: number): string {
  const date = parseCivilDate(value);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatCivilDate(target);
}

export function insightGranularity(period: InsightPeriod): InsightGranularity {
  if (period === 'last_7_days') return 'day';
  if (period === 'last_30_days') return 'week';
  return 'month';
}

export function insightBucketStarts(period: InsightPeriod, asOfDate: string): string[] {
  const { currentPeriod } = resolveInsightPeriod(period, asOfDate);
  const granularity = insightGranularity(period);
  if (granularity === 'day') {
    return Array.from({ length: 7 }, (_, index) => addCivilDays(currentPeriod.startDate, index));
  }
  if (granularity === 'week') {
    return Array.from({ length: 5 }, (_, index) => addCivilDays(currentPeriod.startDate, index * 7))
      .filter(date => date <= currentPeriod.endDate);
  }

  const monthCount = period === 'last_3_months' ? 3 : 12;
  return Array.from({ length: monthCount }, (_, index) => (
    addCivilDays(addCivilMonths(asOfDate, -(monthCount - index)), 1)
  ));
}

export function insightBucketForDate(
  date: string,
  period: InsightPeriod,
  asOfDate: string,
  bucketStarts = insightBucketStarts(period, asOfDate)
): string | null {
  const { currentPeriod } = resolveInsightPeriod(period, asOfDate);
  if (date < currentPeriod.startDate || date > currentPeriod.endDate) return null;
  for (let index = bucketStarts.length - 1; index >= 0; index -= 1) {
    if (date >= bucketStarts[index]) return bucketStarts[index];
  }
  return null;
}

export function resolveInsightPeriod(period: InsightPeriod, asOfDate: string): {
  currentPeriod: CivilDateRange;
  previousComparablePeriod: CivilDateRange;
} {
  parseCivilDate(asOfDate);
  let currentStart: string;
  let previousStart: string;

  if (period === 'last_7_days' || period === 'last_30_days') {
    const days = period === 'last_7_days' ? 7 : 30;
    currentStart = addCivilDays(asOfDate, -(days - 1));
    const previousEnd = addCivilDays(currentStart, -1);
    previousStart = addCivilDays(previousEnd, -(days - 1));
    return {
      currentPeriod: { startDate: currentStart, endDate: asOfDate },
      previousComparablePeriod: { startDate: previousStart, endDate: previousEnd },
    };
  }

  const months = period === 'last_3_months' ? 3 : 12;
  currentStart = addCivilDays(addCivilMonths(asOfDate, -months), 1);
  const previousEnd = addCivilDays(currentStart, -1);
  previousStart = addCivilMonths(currentStart, -months);
  return {
    currentPeriod: { startDate: currentStart, endDate: asOfDate },
    previousComparablePeriod: { startDate: previousStart, endDate: previousEnd },
  };
}
