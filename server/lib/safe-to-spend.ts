import type { AccountBalanceRecord, AccountBalanceSummary } from './account-balances';
import { addDays, scheduleBills } from './cash-flow-forecast';
import type { NormalizedTransaction } from './financial';
import type { HouseholdPlan } from './household-plan';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';
import { getDaysInMonth } from './time';

/**
 * Safe to spend: cash on hand, less what is already spoken for before the end
 * of the coverage window, less the owner's buffer.
 *
 * Expected income inside the window is deliberately excluded. This answers
 * "what can I spend right now", so it counts money that exists, never money
 * that is forecast to arrive.
 */

export type SafeToSpendStatus = 'ready' | 'unavailable';

export type SafeToSpendBlocker =
  | 'no_connected_cash'
  | 'missing_cash_balance'
  | 'stale_cash_balance'
  | 'connection_needs_attention'
  | 'mixed_currency';

export type SafeToSpendDeductionKind = 'bill' | 'pending' | 'buffer';

export type SafeToSpendDeduction = {
  deductionId: string;
  kind: SafeToSpendDeductionKind;
  label: string;
  amount: number;
  date: string | null;
  accountName: string | null;
};

export type SafeToSpend = {
  status: SafeToSpendStatus;
  asOfDate: string;
  throughDate: string;
  currency: string | null;
  cashBasis: 'available' | 'current' | null;
  cashOnHand: number | null;
  cashAccountCount: number;
  billsDue: number | null;
  pendingOutflow: number | null;
  buffer: number;
  amount: number | null;
  deductions: SafeToSpendDeduction[];
  /** True when the cash basis already nets out pending charges on those accounts. */
  pendingReflectedInBalance: boolean;
  blockers: SafeToSpendBlocker[];
  warning: string | null;
};

const CASH_ACCOUNT_TYPE = 'depository';
/**
 * The window never closes sooner than this. Measuring only to month end would
 * make the last days of a month look flush right before rent posts.
 */
const MINIMUM_WINDOW_DAYS = 14;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function endOfMonth(date: string): string {
  const month = date.slice(0, 7);
  return `${month}-${String(getDaysInMonth(month)).padStart(2, '0')}`;
}

function coverageThroughDate(asOfDate: string): string {
  const minimum = addDays(asOfDate, MINIMUM_WINDOW_DAYS);
  const monthEnd = endOfMonth(asOfDate);
  return monthEnd > minimum ? monthEnd : minimum;
}

function accountLabel(account: AccountBalanceRecord): string {
  return account.accountMask
    ? `${account.accountName} ••••${account.accountMask}`
    : account.accountName;
}

function unavailable(input: {
  asOfDate: string;
  throughDate: string;
  currency: string | null;
  cashAccountCount: number;
  buffer: number;
  blockers: SafeToSpendBlocker[];
  warning: string;
}): SafeToSpend {
  return {
    status: 'unavailable',
    asOfDate: input.asOfDate,
    throughDate: input.throughDate,
    currency: input.currency,
    cashBasis: null,
    cashOnHand: null,
    cashAccountCount: input.cashAccountCount,
    billsDue: null,
    pendingOutflow: null,
    buffer: input.buffer,
    amount: null,
    deductions: [],
    pendingReflectedInBalance: false,
    blockers: input.blockers,
    warning: input.warning,
  };
}

/** The cash amount a pending charge will ultimately remove from the account. */
function pendingOutflowAmount(transaction: NormalizedTransaction): number | null {
  const amount = transaction.spendingAdjustment > 0
    ? transaction.spendingAdjustment
    : Math.abs(transaction.cashFlowAmount);
  return Number.isFinite(amount) && amount > 0 ? roundCurrency(amount) : null;
}

export function buildSafeToSpend(input: {
  transactions: NormalizedTransaction[];
  recurringObligations: ReviewedRecurringObligation[];
  accountBalances: AccountBalanceSummary;
  plan: HouseholdPlan;
  asOfDate: string;
}): SafeToSpend {
  if (!isCivilDate(input.asOfDate)) {
    throw new Error('A valid as-of date is required.');
  }

  const buffer = roundCurrency(Math.max(0, input.plan.safeToSpendBuffer));
  const throughDate = coverageThroughDate(input.asOfDate);
  const currency = input.accountBalances.currency;
  const cashAccounts = input.accountBalances.accounts.filter(
    account => account.accountType === CASH_ACCOUNT_TYPE
  );
  const base = {
    asOfDate: input.asOfDate,
    throughDate,
    currency,
    cashAccountCount: cashAccounts.length,
    buffer,
  };

  if (!cashAccounts.length) {
    return unavailable({
      ...base,
      blockers: ['no_connected_cash'],
      warning: 'No connected cash account is reporting a balance yet.',
    });
  }

  // Mirrors how the balance summary picks a single reporting currency: mixing
  // currencies would make the total a number that means nothing.
  const foreignCashAccounts = cashAccounts.filter(
    account => account.isoCurrencyCode !== currency
  );
  if (currency === null || foreignCashAccounts.length) {
    return unavailable({
      ...base,
      blockers: ['mixed_currency'],
      warning: 'Connected cash accounts report more than one currency, so they cannot be totalled.',
    });
  }

  const blockers: SafeToSpendBlocker[] = [];
  if (cashAccounts.some(account => account.health !== 'healthy')) {
    blockers.push('connection_needs_attention');
  }
  if (cashAccounts.some(account => account.balanceStatus === 'missing')) {
    blockers.push('missing_cash_balance');
  } else if (cashAccounts.some(account => account.balanceStatus !== 'fresh')) {
    blockers.push('stale_cash_balance');
  }
  if (cashAccounts.some(account => account.current === null)) {
    if (!blockers.includes('missing_cash_balance')) blockers.push('missing_cash_balance');
  }

  if (blockers.length) {
    return unavailable({
      ...base,
      blockers,
      warning: blockers.includes('connection_needs_attention')
        ? 'A cash account needs to be reconnected before a safe-to-spend figure can be trusted.'
        : blockers.includes('missing_cash_balance')
          ? 'At least one cash account has not reported a balance yet.'
          : 'Cash balances are older than a successful sync, so this figure is withheld.',
    });
  }

  const cashBasis = cashAccounts.every(account => account.available !== null)
    ? 'available' as const
    : 'current' as const;
  const cashOnHand = roundCurrency(cashAccounts.reduce(
    (total, account) => total + (account[cashBasis] as number),
    0
  ));
  const cashAccountIds = new Set(cashAccounts.map(account => account.accountId));
  const accountsById = new Map(
    input.accountBalances.accounts.map(account => [account.accountId, account])
  );

  const billEvents = scheduleBills({
    transactions: input.transactions,
    obligations: input.recurringObligations,
    accounts: input.accountBalances.accounts,
    asOfDate: input.asOfDate,
    throughDate,
    forecastAccountId: null,
    balanceBasis: cashBasis,
  }).filter(event => event.date <= throughDate);

  const billDeductions: SafeToSpendDeduction[] = billEvents.map(event => ({
    deductionId: event.eventId,
    kind: 'bill' as const,
    label: event.label,
    amount: roundCurrency(event.amount),
    date: event.date,
    accountName: event.accountName,
  }));

  // A charge already scheduled as a bill must not be counted a second time as
  // a pending transaction.
  const billedPendingIds = new Set(
    billEvents.flatMap(event => event.pendingTransactionId ? [event.pendingTransactionId] : [])
  );

  const pendingDeductions: SafeToSpendDeduction[] = input.transactions.flatMap(transaction => {
    if (
      transaction.removed ||
      !transaction.pending ||
      transaction.classification !== 'spending' ||
      billedPendingIds.has(transaction.transactionId)
    ) return [];
    // Under an available-balance basis the bank has already withheld pending
    // charges on these accounts; deducting them again would double-count.
    const onCashAccount = cashAccountIds.has(transaction.accountId);
    if (onCashAccount && cashBasis === 'available') return [];
    const amount = pendingOutflowAmount(transaction);
    if (amount == null) return [];
    const account = accountsById.get(transaction.accountId);
    return [{
      deductionId: `pending:${transaction.transactionId}`,
      kind: 'pending' as const,
      label: transaction.normalizedMerchant || transaction.name,
      amount,
      date: isCivilDate(transaction.normalizedDate) ? transaction.normalizedDate : null,
      accountName: account ? accountLabel(account) : null,
    }];
  });

  const billsDue = roundCurrency(
    billDeductions.reduce((total, deduction) => total + deduction.amount, 0)
  );
  const pendingOutflow = roundCurrency(
    pendingDeductions.reduce((total, deduction) => total + deduction.amount, 0)
  );

  const deductions = [...billDeductions, ...pendingDeductions].sort((left, right) => (
    (left.date || '').localeCompare(right.date || '') ||
    right.amount - left.amount ||
    left.label.localeCompare(right.label)
  ));
  if (buffer > 0) {
    deductions.push({
      deductionId: 'buffer',
      kind: 'buffer',
      label: 'Buffer you set aside',
      amount: buffer,
      date: null,
      accountName: null,
    });
  }

  return {
    status: 'ready',
    asOfDate: input.asOfDate,
    throughDate,
    currency,
    cashBasis,
    cashOnHand,
    cashAccountCount: cashAccounts.length,
    billsDue,
    pendingOutflow,
    buffer,
    amount: roundCurrency(cashOnHand - billsDue - pendingOutflow - buffer),
    deductions,
    pendingReflectedInBalance: cashBasis === 'available',
    blockers: [],
    warning: null,
  };
}
