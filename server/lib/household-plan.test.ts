import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSEHOLD_PLAN,
  HouseholdPlanRequestError,
  buildSpendingTargetProgress,
  parseHouseholdPlanInput,
  parseStoredHouseholdPlan,
} from './household-plan';

describe('parseHouseholdPlanInput', () => {
  it('accepts a buffer and a target', () => {
    expect(parseHouseholdPlanInput({
      safeToSpendBuffer: 500,
      monthlySpendingTarget: 6200.5,
    })).toEqual({ safeToSpendBuffer: 500, monthlySpendingTarget: 6200.5 });
  });

  it('leaves an omitted field at its current value', () => {
    const current = { safeToSpendBuffer: 300, monthlySpendingTarget: 5000 };
    expect(parseHouseholdPlanInput({ safeToSpendBuffer: 400 }, current))
      .toEqual({ safeToSpendBuffer: 400, monthlySpendingTarget: 5000 });
    expect(parseHouseholdPlanInput({ monthlySpendingTarget: 5500 }, current))
      .toEqual({ safeToSpendBuffer: 300, monthlySpendingTarget: 5500 });
  });

  it('clears the target only when it is explicitly null', () => {
    const current = { safeToSpendBuffer: 300, monthlySpendingTarget: 5000 };
    expect(parseHouseholdPlanInput({ monthlySpendingTarget: null }, current).monthlySpendingTarget)
      .toBeNull();
  });

  it('allows a zero buffer but rejects a negative one', () => {
    expect(parseHouseholdPlanInput({ safeToSpendBuffer: 0 }).safeToSpendBuffer).toBe(0);
    expect(() => parseHouseholdPlanInput({ safeToSpendBuffer: -1 }))
      .toThrow(HouseholdPlanRequestError);
  });

  it('rejects a zero or non-numeric target', () => {
    expect(() => parseHouseholdPlanInput({ monthlySpendingTarget: 0 }))
      .toThrow(HouseholdPlanRequestError);
    expect(() => parseHouseholdPlanInput({ monthlySpendingTarget: '5000' }))
      .toThrow(HouseholdPlanRequestError);
    expect(() => parseHouseholdPlanInput({ safeToSpendBuffer: Number.NaN }))
      .toThrow(HouseholdPlanRequestError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseHouseholdPlanInput(null)).toThrow(HouseholdPlanRequestError);
  });
});

describe('parseStoredHouseholdPlan', () => {
  it('falls back to the default rather than throwing on damaged data', () => {
    expect(parseStoredHouseholdPlan(undefined)).toEqual(DEFAULT_HOUSEHOLD_PLAN);
    expect(parseStoredHouseholdPlan({ safeToSpendBuffer: -5, monthlySpendingTarget: 0 }))
      .toEqual(DEFAULT_HOUSEHOLD_PLAN);
  });

  it('reads a stored plan', () => {
    expect(parseStoredHouseholdPlan({ safeToSpendBuffer: 250, monthlySpendingTarget: 4800 }))
      .toEqual({ safeToSpendBuffer: 250, monthlySpendingTarget: 4800 });
  });
});

describe('buildSpendingTargetProgress', () => {
  const baseline = {
    month: '2026-09',
    daysElapsed: 10,
    daysInMonth: 30,
    spentToDate: 1500,
    projectedMonthEndSpending: 4500,
    projectionMaturity: 'developing' as const,
  };

  it('returns null when no target is set', () => {
    expect(buildSpendingTargetProgress({
      ...baseline,
      plan: { safeToSpendBuffer: 0, monthlySpendingTarget: null },
    })).toBeNull();
  });

  it('measures pace against a straight-line share of the target', () => {
    const progress = buildSpendingTargetProgress({
      ...baseline,
      plan: { safeToSpendBuffer: 0, monthlySpendingTarget: 4500 },
    });

    expect(progress).toMatchObject({
      target: 4500,
      spentToDate: 1500,
      remaining: 3000,
      expectedToDate: 1500,
      paceDifference: 0,
      projectedDifference: 0,
      verdict: 'on_track',
    });
  });

  it('calls a projection over the target only outside a five percent tolerance', () => {
    expect(buildSpendingTargetProgress({
      ...baseline,
      projectedMonthEndSpending: 4600,
      plan: { safeToSpendBuffer: 0, monthlySpendingTarget: 4500 },
    })?.verdict).toBe('on_track');

    expect(buildSpendingTargetProgress({
      ...baseline,
      projectedMonthEndSpending: 5400,
      plan: { safeToSpendBuffer: 0, monthlySpendingTarget: 4500 },
    })?.verdict).toBe('over');

    expect(buildSpendingTargetProgress({
      ...baseline,
      projectedMonthEndSpending: 3600,
      plan: { safeToSpendBuffer: 0, monthlySpendingTarget: 4500 },
    })?.verdict).toBe('under');
  });

  it('rejects an impossible day position', () => {
    expect(() => buildSpendingTargetProgress({
      ...baseline,
      daysElapsed: 45,
      plan: { safeToSpendBuffer: 0, monthlySpendingTarget: 4500 },
    })).toThrow(/valid day position/);
  });
});
