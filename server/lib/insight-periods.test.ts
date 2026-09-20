import { describe, expect, it } from 'vitest';
import {
  addCivilDays,
  addCivilMonths,
  daysBetweenCivilDates,
  insightBucketForDate,
  insightBucketStarts,
  insightGranularity,
  resolveInsightPeriod,
} from './insight-periods';

describe('shared insight periods', () => {
  it('resolves inclusive rolling day windows and their prior comparisons', () => {
    expect(resolveInsightPeriod('last_7_days', '2026-09-20')).toEqual({
      currentPeriod: { startDate: '2026-09-14', endDate: '2026-09-20' },
      previousComparablePeriod: { startDate: '2026-09-07', endDate: '2026-09-13' },
    });
    expect(resolveInsightPeriod('last_30_days', '2026-03-01')).toEqual({
      currentPeriod: { startDate: '2026-01-31', endDate: '2026-03-01' },
      previousComparablePeriod: { startDate: '2026-01-01', endDate: '2026-01-30' },
    });
  });

  it('keeps rolling month windows aligned across short months and leap years', () => {
    expect(resolveInsightPeriod('last_3_months', '2024-02-29')).toEqual({
      currentPeriod: { startDate: '2023-11-30', endDate: '2024-02-29' },
      previousComparablePeriod: { startDate: '2023-08-30', endDate: '2023-11-29' },
    });
    expect(resolveInsightPeriod('last_12_months', '2025-02-28')).toEqual({
      currentPeriod: { startDate: '2024-02-29', endDate: '2025-02-28' },
      previousComparablePeriod: { startDate: '2023-02-28', endDate: '2024-02-28' },
    });
  });

  it('uses UTC civil-date math so daylight-saving changes do not alter day counts', () => {
    expect(addCivilDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addCivilDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(daysBetweenCivilDates('2026-03-07', '2026-03-10')).toBe(3);
    expect(daysBetweenCivilDates('2026-10-31', '2026-11-03')).toBe(3);
  });

  it('clamps month arithmetic to valid month-end dates', () => {
    expect(addCivilMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addCivilMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addCivilMonths('2024-03-31', -1)).toBe('2024-02-29');
  });

  it('returns stable granularities and bucket starts for all shared periods', () => {
    expect(insightGranularity('last_7_days')).toBe('day');
    expect(insightGranularity('last_30_days')).toBe('week');
    expect(insightGranularity('last_3_months')).toBe('month');
    expect(insightGranularity('last_12_months')).toBe('month');

    expect(insightBucketStarts('last_7_days', '2026-09-20')).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
      '2026-09-18', '2026-09-19', '2026-09-20',
    ]);
    expect(insightBucketStarts('last_30_days', '2026-09-20')).toEqual([
      '2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19',
    ]);
    expect(insightBucketStarts('last_3_months', '2026-09-20')).toEqual([
      '2026-06-21', '2026-07-21', '2026-08-21',
    ]);
    expect(insightBucketStarts('last_12_months', '2026-09-20')).toHaveLength(12);
  });

  it('places inclusive boundary dates in the right bucket and rejects outside dates', () => {
    const starts = insightBucketStarts('last_30_days', '2026-09-20');
    expect(insightBucketForDate('2026-08-21', 'last_30_days', '2026-09-20', starts)).toBeNull();
    expect(insightBucketForDate('2026-08-22', 'last_30_days', '2026-09-20', starts)).toBe('2026-08-22');
    expect(insightBucketForDate('2026-09-18', 'last_30_days', '2026-09-20', starts)).toBe('2026-09-12');
    expect(insightBucketForDate('2026-09-20', 'last_30_days', '2026-09-20', starts)).toBe('2026-09-19');
    expect(insightBucketForDate('2026-09-21', 'last_30_days', '2026-09-20', starts)).toBeNull();
  });

  it('rejects impossible civil dates instead of silently normalizing them', () => {
    expect(() => resolveInsightPeriod('last_7_days', '2025-02-29')).toThrow('valid as-of date');
    expect(() => addCivilDays('2026-13-01', 1)).toThrow('valid as-of date');
  });
});
