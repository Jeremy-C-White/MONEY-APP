import type {
  LikelyRecurringObligation,
  RecurringCadence,
  RecurringConfidence,
  RecurringObligationsReport,
} from './recurring-obligations';

type UnknownRecord = Record<string, unknown>;

export const RECURRING_DECISION_STATUSES = [
  'confirmed',
  'seasonal',
  'dismissed',
] as const;

export type RecurringDecisionStatus = typeof RECURRING_DECISION_STATUSES[number];

export type RecurringObligationDecision = {
  status: RecurringDecisionStatus;
  expectedMonthlyAmount: number;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
  note: string | null;
};

export type StoredRecurringObligationDecision = RecurringObligationDecision & {
  merchant: string;
  category: string;
  cadence: RecurringCadence;
  confidence: RecurringConfidence;
  typicalCharge: number;
  detectedMonthlyAmount: number;
  occurrenceCount: number;
  lastChargeDate: string;
  updatedAt: unknown;
  updatedBy: string;
};

export type ReviewedRecurringObligation = LikelyRecurringObligation & {
  status: 'suggested' | RecurringDecisionStatus;
  expectedMonthlyAmount: number;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
  note: string | null;
  detected: boolean;
};

export type RecurringForecastPoint = {
  month: string;
  confirmedAmount: number;
  obligationCount: number;
};

export type RecurringPlanningReport = {
  obligations: ReviewedRecurringObligation[];
  estimatedMonthlyTotal: number;
  confirmedMonthlyTotal: number;
  suggestionCount: number;
  analyzedThrough: string | null;
  forecast: RecurringForecastPoint[];
};

export class RecurringObligationRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'RecurringObligationRequestError';
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDecisionStatus(value: unknown): value is RecurringDecisionStatus {
  return typeof value === 'string' && (
    RECURRING_DECISION_STATUSES as readonly string[]
  ).includes(value);
}

function isCadence(value: unknown): value is RecurringCadence {
  return value === 'weekly' || value === 'biweekly' || value === 'monthly';
}

function isConfidence(value: unknown): value is RecurringConfidence {
  return value === 'high' || value === 'medium';
}

function parseMonth(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 12) {
    throw new RecurringObligationRequestError(`${field} must be a month from 1 to 12.`, 400);
  }
  return Number(value);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parseRecurringDecisionInput(value: unknown): RecurringObligationDecision {
  if (!isRecord(value) || !isDecisionStatus(value.status)) {
    throw new RecurringObligationRequestError('Invalid recurring-obligation status.', 400);
  }

  if (
    typeof value.expectedMonthlyAmount !== 'number' ||
    !Number.isFinite(value.expectedMonthlyAmount) ||
    value.expectedMonthlyAmount <= 0 ||
    value.expectedMonthlyAmount > 1_000_000
  ) {
    throw new RecurringObligationRequestError(
      'expectedMonthlyAmount must be greater than 0 and no more than 1000000.',
      400
    );
  }

  let seasonStartMonth: number | null = null;
  let seasonEndMonth: number | null = null;
  if (value.status === 'seasonal') {
    seasonStartMonth = parseMonth(value.seasonStartMonth, 'seasonStartMonth');
    seasonEndMonth = parseMonth(value.seasonEndMonth, 'seasonEndMonth');
  }

  let note: string | null = null;
  if (value.note !== undefined && value.note !== null) {
    if (typeof value.note !== 'string' || value.note.length > 200) {
      throw new RecurringObligationRequestError('note must be 200 characters or fewer.', 400);
    }
    note = value.note.trim() || null;
  }

  return {
    status: value.status,
    expectedMonthlyAmount: roundCurrency(value.expectedMonthlyAmount),
    seasonStartMonth,
    seasonEndMonth,
    note,
  };
}

export function parseStoredRecurringDecision(
  value: unknown
): StoredRecurringObligationDecision | null {
  try {
    if (!isRecord(value)) return null;
    const decision = parseRecurringDecisionInput(value);
    if (
      typeof value.merchant !== 'string' || !value.merchant.trim() ||
      typeof value.category !== 'string' ||
      !isCadence(value.cadence) ||
      !isConfidence(value.confidence) ||
      typeof value.typicalCharge !== 'number' ||
      typeof value.detectedMonthlyAmount !== 'number' ||
      typeof value.occurrenceCount !== 'number' ||
      typeof value.lastChargeDate !== 'string' ||
      typeof value.updatedBy !== 'string'
    ) return null;

    return {
      ...decision,
      merchant: value.merchant,
      category: value.category,
      cadence: value.cadence,
      confidence: value.confidence,
      typicalCharge: value.typicalCharge,
      detectedMonthlyAmount: value.detectedMonthlyAmount,
      occurrenceCount: value.occurrenceCount,
      lastChargeDate: value.lastChargeDate,
      updatedAt: value.updatedAt,
      updatedBy: value.updatedBy,
    };
  } catch {
    return null;
  }
}

function isSeasonActive(startMonth: number, endMonth: number, month: number): boolean {
  return startMonth <= endMonth
    ? month >= startMonth && month <= endMonth
    : month >= startMonth || month <= endMonth;
}

function isIncludedInMonth(
  obligation: ReviewedRecurringObligation,
  month: number
): boolean {
  if (obligation.status === 'confirmed') return true;
  if (
    obligation.status === 'seasonal' &&
    obligation.seasonStartMonth != null &&
    obligation.seasonEndMonth != null
  ) {
    return isSeasonActive(
      obligation.seasonStartMonth,
      obligation.seasonEndMonth,
      month
    );
  }
  return false;
}

function addMonths(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildRecurringPlanningReport(
  detected: RecurringObligationsReport,
  decisions: Map<string, StoredRecurringObligationDecision>,
  currentMonth: string
): RecurringPlanningReport {
  const detectedIds = new Set(detected.obligations.map(item => item.obligationId));
  const obligations: ReviewedRecurringObligation[] = detected.obligations.map(item => {
    const decision = decisions.get(item.obligationId);
    return {
      ...item,
      status: decision?.status || 'suggested',
      expectedMonthlyAmount: decision?.expectedMonthlyAmount || item.estimatedMonthlyAmount,
      seasonStartMonth: decision?.seasonStartMonth || null,
      seasonEndMonth: decision?.seasonEndMonth || null,
      note: decision?.note || null,
      detected: true,
    };
  });

  for (const [obligationId, decision] of decisions) {
    if (detectedIds.has(obligationId) || decision.status === 'dismissed') continue;
    obligations.push({
      obligationId,
      merchant: decision.merchant,
      category: decision.category,
      cadence: decision.cadence,
      confidence: decision.confidence,
      typicalCharge: decision.typicalCharge,
      estimatedMonthlyAmount: decision.detectedMonthlyAmount,
      occurrenceCount: decision.occurrenceCount,
      lastChargeDate: decision.lastChargeDate,
      status: decision.status,
      expectedMonthlyAmount: decision.expectedMonthlyAmount,
      seasonStartMonth: decision.seasonStartMonth,
      seasonEndMonth: decision.seasonEndMonth,
      note: decision.note,
      detected: false,
    });
  }

  const statusOrder: Record<ReviewedRecurringObligation['status'], number> = {
    suggested: 0,
    confirmed: 1,
    seasonal: 1,
    dismissed: 2,
  };
  obligations.sort((a, b) => (
    statusOrder[a.status] - statusOrder[b.status] ||
    b.expectedMonthlyAmount - a.expectedMonthlyAmount ||
    a.merchant.localeCompare(b.merchant)
  ));

  const forecast = Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(currentMonth, index);
    const monthNumber = Number(month.slice(5, 7));
    const included = obligations.filter(obligation => isIncludedInMonth(obligation, monthNumber));
    return {
      month,
      confirmedAmount: roundCurrency(
        included.reduce((total, obligation) => total + obligation.expectedMonthlyAmount, 0)
      ),
      obligationCount: included.length,
    };
  });

  return {
    obligations,
    estimatedMonthlyTotal: detected.estimatedMonthlyTotal,
    confirmedMonthlyTotal: forecast[0]?.confirmedAmount || 0,
    suggestionCount: obligations.filter(item => item.status === 'suggested').length,
    analyzedThrough: detected.analyzedThrough,
    forecast,
  };
}

export type RecurringDecisionServiceDependencies = {
  loadDetected: (uid: string) => Promise<RecurringObligationsReport>;
  setDecision: (
    uid: string,
    obligationId: string,
    decision: StoredRecurringObligationDecision
  ) => Promise<void>;
  deleteDecision: (uid: string, obligationId: string) => Promise<void>;
  updatedAt: () => unknown;
};

function validateObligationId(obligationId: string): void {
  if (!/^[a-f0-9]{24}$/.test(obligationId)) {
    throw new RecurringObligationRequestError('Invalid recurring-obligation ID.', 400);
  }
}

export async function saveRecurringDecision(
  dependencies: RecurringDecisionServiceDependencies,
  uid: string,
  obligationId: string,
  value: unknown
): Promise<StoredRecurringObligationDecision> {
  validateObligationId(obligationId);
  const decision = parseRecurringDecisionInput(value);
  const candidate = (await dependencies.loadDetected(uid)).obligations
    .find(item => item.obligationId === obligationId);
  if (!candidate) {
    throw new RecurringObligationRequestError('Recurring suggestion not found.', 404);
  }

  const stored: StoredRecurringObligationDecision = {
    ...decision,
    merchant: candidate.merchant,
    category: candidate.category,
    cadence: candidate.cadence,
    confidence: candidate.confidence,
    typicalCharge: candidate.typicalCharge,
    detectedMonthlyAmount: candidate.estimatedMonthlyAmount,
    occurrenceCount: candidate.occurrenceCount,
    lastChargeDate: candidate.lastChargeDate,
    updatedAt: dependencies.updatedAt(),
    updatedBy: uid,
  };
  await dependencies.setDecision(uid, obligationId, stored);
  return stored;
}

export async function removeRecurringDecision(
  dependencies: RecurringDecisionServiceDependencies,
  uid: string,
  obligationId: string
): Promise<void> {
  validateObligationId(obligationId);
  await dependencies.deleteDecision(uid, obligationId);
}
