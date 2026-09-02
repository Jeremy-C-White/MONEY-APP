export function getMonthForDateInTimezone(date: Date, tz = process.env.FINANCE_TIME_ZONE || 'America/New_York'): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  return `${year}-${month}`;
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