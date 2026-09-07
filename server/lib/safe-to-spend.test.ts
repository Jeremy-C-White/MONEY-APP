import { describe, expect, it } from 'vitest';
import type { AccountBalanceRecord, AccountBalanceSummary } from './account-balances';
import type { NormalizedTransaction } from './financial';
import type { HouseholdPlan } from './household-plan';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';
import { buildSafeToSpend } from './safe-to-spend';

const AS_OF = '2026-09-06';

function transaction(
  overrides: Partial<NormalizedTransaction> & Pick<NormalizedTransaction, 'transactionId' | 'normalizedDate'>
): NormalizedTransaction {
  return {
    transactionId: overrides.transactionId,
    normalizedDate: overrides.normalizedDate,
    accountId: 'checking-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    rawDate: overrides.normalizedDate,
    name: 'Purchase',
    normalizedMerchant: 'Merchant',
    plaidAmount: 10,
    cashFlowAmount: -10,
    categoryPrimary: 'GENERAL_MERCHANDISE',
    categoryDetailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
    normalizedCategory: 'GENERAL_MERCHANDISE',
    pending: false,
    pendingTransactionId: '',
    status: 'active',
    removed: false,
    classification: 'spending',
    countsTowardSpending: true,
    countsTowardIncome: false,
    spendingAdjustment: 10,
    incomeAdjustment: 0,
    isOverridden: false,
    overrideNote: null,
    overrideOffsetCategory: null,
    ...overrides,
  };
}

function obligation(
  overrides: Partial<ReviewedRecurringObligation> & Pick<ReviewedRecurringObligation, 'obligationId' | 'merchant'>
): ReviewedRecurringObligation {
  return {
    obligationId: overrides.obligationId,
    merchant: overrides.merchant,
    category: 'RENT_AND_UTILITIES',
    cadence: 'monthly',
    confidence: 'high',
    typicalCharge: 100,
    estimatedMonthlyAmount: 100,
    occurrenceCount: 6,
    lastChargeDate: '2026-08-15',
    status: 'confirmed',
    expectedMonthlyAmount: 100,
    seasonStartMonth: null,
    seasonEndMonth: null,
    note: null,
    detected: true,
    ...overrides,
  };
}

function account(overrides: Partial<AccountBalanceRecord> = {}): AccountBalanceRecord {
  return {
    accountId: 'checking-1',
    institutionName: 'Bank',
    accountName: 'Checking',
    accountMask: '1234',
    accountType: 'depository',
    accountSubtype: 'checking',
    current: 4000,
    available: 4000,
    limit: null,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    health: 'healthy',
    fetchedAt: '2026-09-06T12:00:00.000Z',
    balanceStatus: 'fresh',
    ...overrides,
  };
}

function balances(accounts: AccountBalanceRecord[] = [account()]): AccountBalanceSummary {
  return {
    status: 'complete',
    currency: 'USD',
    oldestFetchedAt: '2026-09-06T12:00:00.000Z',
    newestFetchedAt: '2026-09-06T12:00:00.000Z',
    connectedItemCount: 1,
    reportingItemCount: 1,
    freshItemCount: 1,
    missingCurrentBalanceCount: 0,
    currencyIssueCount: 0,
    cashCurrent: 4000,
    cashAvailable: 4000,
    creditBalance: null,
    creditOwed: null,
    creditCredits: null,
    loanBalance: null,
    investmentValue: null,
    connectedPosition: 4000,
    issues: [],
    accounts,
  };
}

const noPlan: HouseholdPlan = { safeToSpendBuffer: 0, monthlySpendingTarget: null };

function build(overrides: Partial<Parameters<typeof buildSafeToSpend>[0]> = {}) {
  return buildSafeToSpend({
    transactions: [],
    recurringObligations: [],
    accountBalances: balances(),
    plan: noPlan,
    asOfDate: AS_OF,
    ...overrides,
  });
}

describe('buildSafeToSpend', () => {
  it('subtracts confirmed bills due in the window and the owner buffer from cash', () => {
    const result = build({
      recurringObligations: [
        obligation({
          obligationId: 'a'.repeat(24),
          merchant: 'Brookwood Preschool',
          lastChargeDate: '2026-08-12',
          expectedMonthlyAmount: 1800,
        }),
        obligation({
          obligationId: 'b'.repeat(24),
          merchant: 'Verizon',
          lastChargeDate: '2026-08-20',
          expectedMonthlyAmount: 380,
        }),
      ],
      plan: { safeToSpendBuffer: 250, monthlySpendingTarget: null },
    });

    expect(result.status).toBe('ready');
    expect(result.cashOnHand).toBe(4000);
    expect(result.billsDue).toBe(2180);
    expect(result.buffer).toBe(250);
    expect(result.amount).toBe(1570);
    expect(result.deductions.filter(item => item.kind === 'bill').map(item => item.label))
      .toEqual(['Brookwood Preschool', 'Verizon']);
    expect(result.deductions.at(-1)).toMatchObject({ kind: 'buffer', amount: 250 });
  });

  it('covers at least fourteen days so month end does not look flush', () => {
    // Sept 30 is only two days out; the window must reach into October.
    const result = build({ asOfDate: '2026-09-28' });
    expect(result.throughDate).toBe('2026-10-12');
  });

  it('extends the window to month end when that is further out', () => {
    expect(build({ asOfDate: '2026-09-06' }).throughDate).toBe('2026-09-30');
  });

  it('excludes bills falling after the coverage window', () => {
    // Last charged Sept 5, so the next monthly occurrence is Oct 5 — beyond
    // the Sept 30 window. The Aug 31 case one month earlier lands on Sept 30
    // and is counted, so both edges are covered.
    const result = build({
      asOfDate: '2026-09-06',
      recurringObligations: [obligation({
        obligationId: 'c'.repeat(24),
        merchant: 'Late Bill',
        lastChargeDate: '2026-09-05',
        expectedMonthlyAmount: 500,
      })],
    });

    expect(result.throughDate).toBe('2026-09-30');
    expect(result.billsDue).toBe(0);
    expect(result.amount).toBe(4000);
  });

  it('includes a bill landing on the last day of the window', () => {
    const result = build({
      asOfDate: '2026-09-06',
      recurringObligations: [obligation({
        obligationId: 'c'.repeat(24),
        merchant: 'Month End Bill',
        lastChargeDate: '2026-08-30',
        expectedMonthlyAmount: 500,
      })],
    });

    expect(result.billsDue).toBe(500);
    expect(result.deductions[0]).toMatchObject({ date: '2026-09-30', amount: 500 });
  });

  it('deducts pending charges when the basis is the current balance', () => {
    const result = build({
      accountBalances: balances([account({ available: null })]),
      transactions: [transaction({
        transactionId: 'pending-1',
        normalizedDate: '2026-09-05',
        normalizedMerchant: 'Lowes',
        pending: true,
        cashFlowAmount: -250,
        spendingAdjustment: 250,
      })],
    });

    expect(result.cashBasis).toBe('current');
    expect(result.pendingReflectedInBalance).toBe(false);
    expect(result.pendingOutflow).toBe(250);
    expect(result.amount).toBe(3750);
  });

  it('does not double-count pending charges the available balance already withholds', () => {
    const result = build({
      transactions: [transaction({
        transactionId: 'pending-1',
        normalizedDate: '2026-09-05',
        normalizedMerchant: 'Lowes',
        pending: true,
        cashFlowAmount: -250,
        spendingAdjustment: 250,
      })],
    });

    expect(result.cashBasis).toBe('available');
    expect(result.pendingReflectedInBalance).toBe(true);
    expect(result.pendingOutflow).toBe(0);
    expect(result.amount).toBe(4000);
  });

  it('still deducts a pending charge on a card the cash balance cannot reflect', () => {
    const result = build({
      accountBalances: balances([
        account(),
        account({
          accountId: 'card-1',
          accountName: 'Card',
          accountType: 'credit',
          current: 900,
          available: 4100,
        }),
      ]),
      transactions: [transaction({
        transactionId: 'pending-card',
        normalizedDate: '2026-09-05',
        accountId: 'card-1',
        accountType: 'credit',
        normalizedMerchant: 'Lowes',
        pending: true,
        cashFlowAmount: -250,
        spendingAdjustment: 250,
      })],
    });

    expect(result.cashBasis).toBe('available');
    expect(result.cashOnHand).toBe(4000);
    expect(result.pendingOutflow).toBe(250);
    expect(result.amount).toBe(3750);
  });

  it('counts a pending charge once when it is also a scheduled bill', () => {
    const pendingBill = transaction({
      transactionId: 'pending-verizon',
      normalizedDate: '2026-09-08',
      normalizedMerchant: 'Verizon',
      pending: true,
      cashFlowAmount: -380,
      spendingAdjustment: 380,
    });
    const history = transaction({
      transactionId: 'posted-verizon',
      normalizedDate: '2026-08-08',
      normalizedMerchant: 'Verizon',
      cashFlowAmount: -380,
      spendingAdjustment: 380,
    });
    const result = build({
      accountBalances: balances([account({ available: null })]),
      transactions: [history, pendingBill],
      recurringObligations: [obligation({
        obligationId: 'd'.repeat(24),
        merchant: 'Verizon',
        lastChargeDate: '2026-08-08',
        expectedMonthlyAmount: 380,
      })],
    });

    expect(result.cashBasis).toBe('current');
    expect(result.billsDue).toBe(380);
    expect(result.pendingOutflow).toBe(0);
    expect(result.amount).toBe(3620);
  });

  it('ignores removed, posted, and non-spending transactions', () => {
    const result = build({
      accountBalances: balances([account({ available: null })]),
      transactions: [
        transaction({
          transactionId: 'removed',
          normalizedDate: '2026-09-05',
          pending: true,
          removed: true,
          spendingAdjustment: 100,
        }),
        transaction({
          transactionId: 'posted',
          normalizedDate: '2026-09-05',
          spendingAdjustment: 100,
        }),
        transaction({
          transactionId: 'pending-transfer',
          normalizedDate: '2026-09-05',
          pending: true,
          classification: 'internal_transfer',
          countsTowardSpending: false,
          spendingAdjustment: 0,
          cashFlowAmount: -100,
        }),
      ],
    });

    expect(result.pendingOutflow).toBe(0);
    expect(result.amount).toBe(4000);
  });

  it('excludes reserve balances from cash on hand', () => {
    const result = build({
      accountBalances: balances([
        account(),
        account({
          accountId: 'savings-1',
          accountName: 'Savings',
          accountSubtype: 'savings',
          current: 1200,
          available: 1200,
        }),
      ]),
    });

    expect(result.cashAccountCount).toBe(1);
    expect(result.excludedCashAccountCount).toBe(1);
    expect(result.cashOnHand).toBe(4000);
    expect(result.amount).toBe(4000);
  });

  it('does not move when a reserve balance changes', () => {
    const buildWithReserve = (value: number) => build({
      accountBalances: balances([
        account(),
        account({
          accountId: 'savings-1',
          accountName: 'Savings',
          accountSubtype: 'savings',
          current: value,
          available: value,
        }),
      ]),
    });

    expect(buildWithReserve(1200).amount).toBe(buildWithReserve(50_000).amount);
  });

  it('does not move when a retirement balance changes', () => {
    const buildWithRetirement = (value: number) => build({
      accountBalances: balances([
        account(),
        account({
          accountId: 'retirement-1',
          accountName: '401k',
          accountType: 'investment',
          accountSubtype: '401k',
          current: value,
          available: null,
        }),
      ]),
    });

    expect(buildWithRetirement(10_000).amount).toBe(buildWithRetirement(500_000).amount);
  });

  it('moves when an operating balance changes', () => {
    const starting = build().amount;
    const changed = build({
      accountBalances: balances([account({ current: 4750, available: 4750 })]),
    }).amount;

    expect(starting).toBe(4000);
    expect(changed).toBe(4750);
  });

  it('surfaces unassigned cash separately without including it', () => {
    const result = build({
      accountBalances: balances([
        account(),
        account({
          accountId: 'unknown-1',
          accountName: 'Unclear cash account',
          accountSubtype: '',
          current: 900,
          available: 900,
        }),
      ]),
    });

    expect(result.status).toBe('ready');
    expect(result.cashOnHand).toBe(4000);
    expect(result.cashAccountCount).toBe(1);
    expect(result.excludedCashAccountCount).toBe(0);
    expect(result.unassignedCashAccountCount).toBe(1);
  });

  it('does not let a stale excluded reserve block operating cash', () => {
    const result = build({
      accountBalances: balances([
        account(),
        account({
          accountId: 'savings-1',
          accountName: 'Savings',
          accountSubtype: 'savings',
          current: 1200,
          available: 1200,
          balanceStatus: 'stale',
        }),
      ]),
    });

    expect(result.status).toBe('ready');
    expect(result.amount).toBe(4000);
  });

  it('withholds the figure when only an unresolved cash account exists', () => {
    const result = build({
      accountBalances: balances([account({ accountSubtype: '' })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.amount).toBeNull();
    expect(result.cashOnHand).toBeNull();
    expect(result.unassignedCashAccountCount).toBe(1);
    expect(result.blockers).toEqual(['operating_account_unresolved']);
    expect(result.warning).toMatch(/confirm their roles/i);
  });

  it('requires confirmation before treating cash management as operating cash', () => {
    const result = build({
      accountBalances: balances([account({ accountSubtype: 'cash management' })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toEqual(['operating_account_unresolved']);
  });

  it('withholds the figure when connected cash contains only reserves', () => {
    const result = build({
      accountBalances: balances([account({ accountSubtype: 'savings' })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toEqual(['no_operating_cash']);
    expect(result.excludedCashAccountCount).toBe(1);
  });

  it('withholds a figure when a cash balance is stale', () => {
    const result = build({
      accountBalances: balances([account({ balanceStatus: 'stale' })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.amount).toBeNull();
    expect(result.cashOnHand).toBeNull();
    expect(result.blockers).toEqual(['stale_cash_balance']);
    expect(result.warning).toMatch(/older than a successful sync/);
  });

  it('withholds a figure when a cash balance is missing', () => {
    const result = build({
      accountBalances: balances([account({ balanceStatus: 'missing', current: null, available: null })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toEqual(['missing_cash_balance']);
  });

  it('withholds a figure when a cash connection needs attention', () => {
    const result = build({
      accountBalances: balances([account({ health: 'login_required' })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toContain('connection_needs_attention');
  });

  it('withholds a figure when no cash account is connected', () => {
    const result = build({
      accountBalances: balances([account({ accountType: 'credit' })]),
    });

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toEqual(['no_connected_cash']);
  });

  it('withholds a figure when cash accounts report different currencies', () => {
    const result = build({
      accountBalances: {
        ...balances([
          account(),
          account({ accountId: 'checking-2', isoCurrencyCode: 'CAD' }),
        ]),
        currency: null,
      },
    });

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toEqual(['mixed_currency']);
  });

  it('reports the buffer it was given even when the figure is withheld', () => {
    const result = build({
      accountBalances: balances([account({ balanceStatus: 'stale' })]),
      plan: { safeToSpendBuffer: 300, monthlySpendingTarget: null },
    });

    expect(result.buffer).toBe(300);
    expect(result.amount).toBeNull();
  });

  it('can go negative rather than clamping to zero', () => {
    const result = build({
      accountBalances: balances([account({ current: 200, available: 200 })]),
      recurringObligations: [obligation({
        obligationId: 'e'.repeat(24),
        merchant: 'Rent',
        lastChargeDate: '2026-08-10',
        expectedMonthlyAmount: 1800,
      })],
    });

    expect(result.amount).toBe(-1600);
  });

  it('rejects an invalid as-of date', () => {
    expect(() => build({ asOfDate: 'September 6' })).toThrow(/valid as-of date/);
  });
});
