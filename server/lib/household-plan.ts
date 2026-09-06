/**
 * Owner-set planning inputs: the safe-to-spend buffer and the household
 * monthly spending target.
 *
 * Both are owner decisions, never inferred. An unset target stays null so
 * every reader renders "no target" rather than inventing one.
 */

export type HouseholdPlan = {
  safeToSpendBuffer: number;
  monthlySpendingTarget: number | null;
};

export type SpendingTargetVerdict = 'under' | 'on_track' | 'over';

export type SpendingTargetProgress = {
  month: string;
  target: number;
  spentToDate: number;
  remaining: number;
  expectedToDate: number;
  paceDifference: number;
  projectedMonthEndSpending: number;
  projectedDifference: number;
  projectionMaturity: 'early' | 'developing' | 'established';
  verdict: SpendingTargetVerdict;
};

export const DEFAULT_HOUSEHOLD_PLAN: HouseholdPlan = {
  safeToSpendBuffer: 0,
  monthlySpendingTarget: null,
};

const MAX_PLAN_AMOUNT = 1_000_000;

export class HouseholdPlanRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'HouseholdPlanRequestError';
  }
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAmount(value: unknown, field: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HouseholdPlanRequestError(`${field} must be a number.`, 400);
  }
  if (value < minimum || value > MAX_PLAN_AMOUNT) {
    throw new HouseholdPlanRequestError(
      `${field} must be between ${minimum} and ${MAX_PLAN_AMOUNT}.`,
      400
    );
  }
  return roundCurrency(value);
}

/**
 * Validates an owner-submitted plan. Absent fields keep their current value,
 * so a request that only sets a buffer cannot silently clear a target.
 */
export function parseHouseholdPlanInput(
  value: unknown,
  current: HouseholdPlan = DEFAULT_HOUSEHOLD_PLAN
): HouseholdPlan {
  if (!isRecord(value)) {
    throw new HouseholdPlanRequestError('A household plan object is required.', 400);
  }

  const safeToSpendBuffer = value.safeToSpendBuffer === undefined
    ? current.safeToSpendBuffer
    : parseAmount(value.safeToSpendBuffer, 'safeToSpendBuffer', 0);

  let monthlySpendingTarget = current.monthlySpendingTarget;
  if (value.monthlySpendingTarget === null) {
    monthlySpendingTarget = null;
  } else if (value.monthlySpendingTarget !== undefined) {
    monthlySpendingTarget = parseAmount(
      value.monthlySpendingTarget,
      'monthlySpendingTarget',
      0.01
    );
  }

  return { safeToSpendBuffer, monthlySpendingTarget };
}

/** Reads whatever is stored, falling back to the default rather than throwing. */
export function parseStoredHouseholdPlan(value: unknown): HouseholdPlan {
  if (!isRecord(value)) return DEFAULT_HOUSEHOLD_PLAN;

  const storedBuffer = value.safeToSpendBuffer;
  const storedTarget = value.monthlySpendingTarget;

  return {
    safeToSpendBuffer:
      typeof storedBuffer === 'number' &&
      Number.isFinite(storedBuffer) &&
      storedBuffer >= 0 &&
      storedBuffer <= MAX_PLAN_AMOUNT
        ? roundCurrency(storedBuffer)
        : DEFAULT_HOUSEHOLD_PLAN.safeToSpendBuffer,
    monthlySpendingTarget:
      typeof storedTarget === 'number' &&
      Number.isFinite(storedTarget) &&
      storedTarget > 0 &&
      storedTarget <= MAX_PLAN_AMOUNT
        ? roundCurrency(storedTarget)
        : DEFAULT_HOUSEHOLD_PLAN.monthlySpendingTarget,
  };
}

/**
 * Measures the month against the owner's target. Returns null when no target
 * is set — "on track" is unanswerable without one, and this says so by
 * omission rather than by inventing a benchmark.
 */
export function buildSpendingTargetProgress(input: {
  plan: HouseholdPlan;
  month: string;
  daysElapsed: number;
  daysInMonth: number;
  spentToDate: number;
  projectedMonthEndSpending: number;
  projectionMaturity: 'early' | 'developing' | 'established';
}): SpendingTargetProgress | null {
  const target = input.plan.monthlySpendingTarget;
  if (target == null) return null;
  if (
    !Number.isInteger(input.daysInMonth) ||
    input.daysInMonth < 28 ||
    input.daysInMonth > 31 ||
    !Number.isInteger(input.daysElapsed) ||
    input.daysElapsed < 1 ||
    input.daysElapsed > input.daysInMonth
  ) {
    throw new Error('Target progress needs a valid day position within the month.');
  }

  const expectedToDate = roundCurrency((target / input.daysInMonth) * input.daysElapsed);
  const projectedDifference = roundCurrency(input.projectedMonthEndSpending - target);
  // A projection within 5% of the target is not a meaningful overrun signal.
  const tolerance = target * 0.05;

  return {
    month: input.month,
    target,
    spentToDate: roundCurrency(input.spentToDate),
    remaining: roundCurrency(target - input.spentToDate),
    expectedToDate,
    paceDifference: roundCurrency(input.spentToDate - expectedToDate),
    projectedMonthEndSpending: roundCurrency(input.projectedMonthEndSpending),
    projectedDifference,
    projectionMaturity: input.projectionMaturity,
    verdict: projectedDifference > tolerance
      ? 'over'
      : projectedDifference < -tolerance
        ? 'under'
        : 'on_track',
  };
}
