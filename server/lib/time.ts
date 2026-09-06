export function getMonthForDateInTimezone(date: Date, tz = process.env.FINANCE_TIME_ZONE || 'America/New_York'): string {
  return getDateForDateInTimezone(date, tz).slice(0, 7);
}

export function getDateForDateInTimezone(date: Date, tz = process.env.FINANCE_TIME_ZONE || 'America/New_York'): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function getDayOfMonthInTimezone(date: Date, tz = process.env.FINANCE_TIME_ZONE || 'America/New_York'): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value;
  return parseInt(day ?? '0', 10);
}

export function getDaysInMonth(monthPrefix: string): number {
  const [yearStr, monthStr] = monthPrefix.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  // Date.UTC, not a local-time constructor: day-count-per-calendar-month
  // doesn't depend on timezone at all, so this can't suffer the local/finance
  // timezone drift the helpers above guard against.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCivilDate(value: unknown): value is string {
  return typeof value === 'string' && CIVIL_DATE.test(value);
}

/**
 * The month bucket for an already-civil YYYY-MM-DD date. A string slice, not a
 * Date: `new Date('2026-09-01')` parses as UTC midnight and can render as
 * August 31 in the finance timezone, silently moving a contribution into the
 * previous month.
 */
export function getMonthForCivilDate(civilDate: string): string | null {
  return isCivilDate(civilDate) ? civilDate.slice(0, 7) : null;
}

/**
 * Whole days between two civil dates. Both are anchored at UTC midnight, so
 * the difference is a pure calendar-day count with no timezone or
 * daylight-saving component.
 */
export function daysBetweenCivilDates(earlier: string, later: string): number | null {
  if (!isCivilDate(earlier) || !isCivilDate(later)) return null;
  const start = Date.parse(`${earlier}T00:00:00Z`);
  const end = Date.parse(`${later}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

/** Adds whole months to a YYYY-MM bucket. */
export function addMonthsToMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}
