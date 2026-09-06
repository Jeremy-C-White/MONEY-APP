import { describe, expect, it } from 'vitest';
import {
  addMonthsToMonth,
  daysBetweenCivilDates,
  getDateForDateInTimezone,
  getDayOfMonthInTimezone,
  getDaysInMonth,
  getMonthForCivilDate,
  getMonthForDateInTimezone,
  isCivilDate,
} from './time';

describe('finance calendar helpers', () => {
  it('uses the requested civil date across a UTC day boundary', () => {
    const instant = new Date('2026-09-02T02:30:00Z');

    expect(getDateForDateInTimezone(instant, 'America/New_York')).toBe('2026-09-01');
    expect(getMonthForDateInTimezone(instant, 'America/New_York')).toBe('2026-09');
    expect(getDayOfMonthInTimezone(instant, 'America/New_York')).toBe(1);
  });

  it('counts leap-year and regular February days', () => {
    expect(getDaysInMonth('2024-02')).toBe(29);
    expect(getDaysInMonth('2026-02')).toBe(28);
  });
});

describe('civil date helpers', () => {
  it('buckets a month by slice, including the first and last day', () => {
    expect(getMonthForCivilDate('2026-09-01')).toBe('2026-09');
    expect(getMonthForCivilDate('2026-09-30')).toBe('2026-09');
    expect(getMonthForCivilDate('2024-02-29')).toBe('2024-02');
    expect(getMonthForCivilDate('2026-12-31')).toBe('2026-12');
  });

  it('rejects anything that is not a civil date', () => {
    expect(getMonthForCivilDate('2026-09')).toBeNull();
    expect(getMonthForCivilDate('not a date')).toBeNull();
    expect(isCivilDate('2026-09-06')).toBe(true);
    expect(isCivilDate(20260906)).toBe(false);
  });

  it('counts whole calendar days across a daylight-saving boundary', () => {
    // US DST ends Nov 1 2026; a local-time difference would report 30.958 days.
    expect(daysBetweenCivilDates('2026-10-15', '2026-11-15')).toBe(31);
    expect(daysBetweenCivilDates('2026-09-06', '2026-09-06')).toBe(0);
    expect(daysBetweenCivilDates('2026-09-20', '2026-09-06')).toBe(-14);
    expect(daysBetweenCivilDates('2026-09-06', 'nope')).toBeNull();
  });

  it('adds months across a year boundary', () => {
    expect(addMonthsToMonth('2026-11', 3)).toBe('2027-02');
    expect(addMonthsToMonth('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToMonth('2026-09', 0)).toBe('2026-09');
  });
});
