import { describe, expect, it, vi } from 'vitest';
import type { RecurringObligationsReport } from './recurring-obligations';
import {
  buildRecurringPlanningReport,
  parseRecurringDecisionInput,
  RecurringObligationRequestError,
  removeRecurringDecision,
  saveRecurringDecision,
  type StoredRecurringObligationDecision,
} from './recurring-obligation-decisions';

const detected: RecurringObligationsReport = {
  analyzedThrough: '2026-09-01',
  estimatedMonthlyTotal: 430,
  obligations: [
    {
      obligationId: '111111111111111111111111',
      merchant: 'Preschool',
      category: 'GENERAL_SERVICES',
      cadence: 'weekly',
      confidence: 'high',
      typicalCharge: 75,
      estimatedMonthlyAmount: 325,
      occurrenceCount: 20,
      lastChargeDate: '2026-08-28',
    },
    {
      obligationId: '222222222222222222222222',
      merchant: 'Lawn Service',
      category: 'HOME_IMPROVEMENT',
      cadence: 'monthly',
      confidence: 'medium',
      typicalCharge: 105,
      estimatedMonthlyAmount: 105,
      occurrenceCount: 4,
      lastChargeDate: '2026-08-25',
    },
  ],
};

function stored(
  overrides: Partial<StoredRecurringObligationDecision> = {}
): StoredRecurringObligationDecision {
  return {
    status: 'confirmed',
    expectedMonthlyAmount: 325,
    seasonStartMonth: null,
    seasonEndMonth: null,
    note: null,
    merchant: 'Preschool',
    category: 'GENERAL_SERVICES',
    cadence: 'weekly',
    confidence: 'high',
    typicalCharge: 75,
    detectedMonthlyAmount: 325,
    occurrenceCount: 20,
    lastChargeDate: '2026-08-28',
    updatedAt: 'now',
    updatedBy: 'user-1',
    ...overrides,
  };
}

describe('recurring decision validation', () => {
  it('accepts confirmed, seasonal, and dismissed decisions', () => {
    expect(parseRecurringDecisionInput({
      status: 'confirmed', expectedMonthlyAmount: 100, note: 'Phone',
    })).toEqual({
      status: 'confirmed', expectedMonthlyAmount: 100,
      seasonStartMonth: null, seasonEndMonth: null, note: 'Phone',
    });
    expect(parseRecurringDecisionInput({
      status: 'seasonal', expectedMonthlyAmount: 75,
      seasonStartMonth: 3, seasonEndMonth: 11,
    }).seasonStartMonth).toBe(3);
    expect(parseRecurringDecisionInput({
      status: 'dismissed', expectedMonthlyAmount: 20,
    }).status).toBe('dismissed');
  });

  it('rejects invalid amounts, seasons, statuses, and long notes', () => {
    const invalid = [
      { status: 'maybe', expectedMonthlyAmount: 10 },
      { status: 'confirmed', expectedMonthlyAmount: 0 },
      { status: 'seasonal', expectedMonthlyAmount: 10, seasonStartMonth: 0, seasonEndMonth: 12 },
      { status: 'confirmed', expectedMonthlyAmount: 10, note: 'x'.repeat(201) },
    ];
    for (const input of invalid) {
      expect(() => parseRecurringDecisionInput(input)).toThrow(RecurringObligationRequestError);
    }
  });
});

describe('buildRecurringPlanningReport', () => {
  it('counts only confirmed and active seasonal items in the current estimate', () => {
    const decisions = new Map<string, StoredRecurringObligationDecision>([
      ['111111111111111111111111', stored()],
      ['222222222222222222222222', stored({
        status: 'seasonal',
        expectedMonthlyAmount: 105,
        seasonStartMonth: 3,
        seasonEndMonth: 10,
        merchant: 'Lawn Service',
      })],
    ]);
    const report = buildRecurringPlanningReport(detected, decisions, '2026-09');

    expect(report.confirmedMonthlyTotal).toBe(430);
    expect(report.suggestionCount).toBe(0);
    expect(report.forecast.map(point => point.confirmedAmount)).toEqual([
      430, 430, 325, 325, 325, 325,
    ]);
  });

  it('supports seasonal ranges that wrap across the end of the year', () => {
    const decisions = new Map<string, StoredRecurringObligationDecision>([
      ['222222222222222222222222', stored({
        status: 'seasonal',
        expectedMonthlyAmount: 105,
        seasonStartMonth: 11,
        seasonEndMonth: 2,
        merchant: 'Winter Service',
      })],
    ]);
    const report = buildRecurringPlanningReport(detected, decisions, '2026-10');
    expect(report.forecast.map(point => point.confirmedAmount)).toEqual([
      0, 105, 105, 105, 105, 0,
    ]);
  });

  it('keeps confirmed items visible if the detector no longer finds them', () => {
    const decisions = new Map<string, StoredRecurringObligationDecision>([
      ['333333333333333333333333', stored({ merchant: 'Confirmed Legacy Bill' })],
    ]);
    const report = buildRecurringPlanningReport(detected, decisions, '2026-09');
    expect(report.obligations.find(item => item.merchant === 'Confirmed Legacy Bill')).toMatchObject({
      detected: false,
      status: 'confirmed',
    });
  });

  it('excludes dismissed items from confirmed totals', () => {
    const decisions = new Map<string, StoredRecurringObligationDecision>([
      ['111111111111111111111111', stored({ status: 'dismissed' })],
    ]);
    const report = buildRecurringPlanningReport(detected, decisions, '2026-09');
    expect(report.confirmedMonthlyTotal).toBe(0);
    expect(report.obligations[0].status).toBe('suggested');
    expect(report.obligations.find(item => item.merchant === 'Preschool')?.status).toBe('dismissed');
  });
});

describe('recurring decision service', () => {
  it('saves a validated decision with server-owned suggestion metadata', async () => {
    const setDecision = vi.fn();
    const result = await saveRecurringDecision({
      loadDetected: async () => detected,
      setDecision,
      deleteDecision: vi.fn(),
      updatedAt: () => 'server-time',
    }, 'user-1', '111111111111111111111111', {
      status: 'confirmed', expectedMonthlyAmount: 330,
    });

    expect(result.merchant).toBe('Preschool');
    expect(result.updatedBy).toBe('user-1');
    expect(result.updatedAt).toBe('server-time');
    expect(setDecision).toHaveBeenCalledWith(
      'user-1', '111111111111111111111111', result
    );
  });

  it('rejects unknown suggestions and invalid IDs', async () => {
    const dependencies = {
      loadDetected: async () => detected,
      setDecision: vi.fn(),
      deleteDecision: vi.fn(),
      updatedAt: () => 'server-time',
    };
    await expect(saveRecurringDecision(
      dependencies, 'user-1', '333333333333333333333333',
      { status: 'confirmed', expectedMonthlyAmount: 10 }
    )).rejects.toMatchObject({ status: 404 });
    await expect(removeRecurringDecision(
      dependencies, 'user-1', '../bad-id'
    )).rejects.toMatchObject({ status: 400 });
  });
});
