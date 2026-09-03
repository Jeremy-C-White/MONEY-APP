import { describe, expect, it } from 'vitest';
import {
  getDateForDateInTimezone,
  getDayOfMonthInTimezone,
  getDaysInMonth,
  getMonthForDateInTimezone,
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
