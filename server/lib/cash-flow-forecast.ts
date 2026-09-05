import type { AccountBalanceRecord, AccountBalanceSummary } from './account-balances';
import type { NormalizedTransaction } from './financial';
import type { ReviewedRecurringObligation } from './recurring-obligation-decisions';

export type CashFlowForecastStatus = 'ready' | 'stale' | 'unavailable';

export type PaycheckStream = {
  streamId: string;
  source: string;
  accountId: string;
  typicalAmount: number;
  cadence: 'biweekly';
  occurrenceCount: number;
  lastDate: string;
  nextDate: string;
};

export type ScheduledCashEvent = {
  eventId: string;
  date: string;
  kind: 'paycheck' | 'bill';
  direction: 'inflow' | 'outflow';
  label: string;
  amount: number;
  accountId: string | null;
  accountName: string | null;
  affectsForecastBalance: boolean;
};

export type DailyCashBalance = {
  date: string;
  balance: number;
};

export type CashFlowForecast = {
  status: CashFlowForecastStatus;
  asOfDate: string;
  throughDate: string;
  balanceBasis: 'available' | 'current' | null;
  startingBalance: number | null;
  forecastAccount: {
    accountId: string;
    institutionName: string;
    accountName: string;
    accountMask: string;
  } | null;
  paycheckStreams: PaycheckStream[];
  upcomingBills: ScheduledCashEvent[];
  scheduledEvents: ScheduledCashEvent[];
  dailyBalances: DailyCashBalance[];
  minimumBalance: number | null;
  minimumBalanceDate: string | null;
  warning: string | null;
};

const DAY_MS = 86_400_000;
const PAYROLL_PATTERN = /^verizon v3\b.*\bdir dep\b/i;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateToMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) ? value : null;
}

function addDays(date: string, days: number): string {
  const value = dateToMs(date);
  if (value == null) throw new Error(`Invalid date: ${date}`);
  return new Date(value + days * DAY_MS).toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth() + 1,
    0
  )).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function daysBetween(earlier: string, later: string): number | null {
  const start = dateToMs(earlier);
  const end = dateToMs(later);
  return start == null || end == null ? null : Math.round((end - start) / DAY_MS);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizedMerchant(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function payrollIdentity(transaction: NormalizedTransaction): string | null {
  const name = transaction.name.trim();
  if (!PAYROLL_PATTERN.test(name)) return null;
  const serviceCode = name.match(/\b(sc\d+)\b/i)?.[1];
  if (serviceCode) return serviceCode.toUpperCase();
  return normalizedMerchant(name)
    .replace(/\b\d{6}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectPaycheckStreams(
  transactions: NormalizedTransaction[],
  asOfDate: string
): PaycheckStream[] {
  const groups = new Map<string, NormalizedTransaction[]>();

  for (const transaction of transactions) {
    const identity = payrollIdentity(transaction);
    if (
      !identity ||
      transaction.removed ||
      transaction.pending ||
      transaction.classification !== 'income' ||
      !transaction.countsTowardIncome ||
      transaction.incomeAdjustment <= 0 ||
      transaction.categoryDetailed !== 'INCOME_SALARY' ||
      transaction.accountType.toLowerCase() !== 'depository' ||
      transaction.accountSubtype.toLowerCase() === 'paypal' ||
      dateToMs(transaction.normalizedDate) == null
    ) continue;

    const key = `${transaction.accountId}\u0000${identity}`;
    const group = groups.get(key) || [];
    group.push(transaction);
    groups.set(key, group);
  }

  return [...groups.entries()].flatMap(([key, transactionsForStream]) => {
    if (transactionsForStream.length < 4) return [];
    const center = median(transactionsForStream.map(item => item.incomeAdjustment));
    const tolerance = Math.max(500, center * 0.35);
    const regular = transactionsForStream
      .filter(item => Math.abs(item.incomeAdjustment - center) <= tolerance)
      .sort((left, right) => left.normalizedDate.localeCompare(right.normalizedDate));
    if (regular.length < 4) return [];

    const uniqueDates = [...new Set(regular.map(item => item.normalizedDate))];
    const intervals = uniqueDates.slice(1).flatMap((date, index) => {
      const interval = daysBetween(uniqueDates[index], date);
      return interval != null && interval > 0 ? [interval] : [];
    });
    const matchingIntervals = intervals.filter(interval => interval >= 12 && interval <= 16);
    if (!intervals.length || matchingIntervals.length / intervals.length < 0.6) return [];

    const lastDate = uniqueDates[uniqueDates.length - 1];
    const age = daysBetween(lastDate, asOfDate);
    if (age == null || age < 0 || age > 35) return [];

    let nextDate = addDays(lastDate, 14);
    while (nextDate <= asOfDate) nextDate = addDays(nextDate, 14);
    const [accountId, identity] = key.split('\u0000');
    const recentRegular = regular.slice(-6);
    return [{
      streamId: `${accountId}:${identity}`,
      source: 'Verizon payroll',
      accountId,
      typicalAmount: roundCurrency(median(recentRegular.map(item => item.incomeAdjustment))),
      cadence: 'biweekly' as const,
      occurrenceCount: regular.length,
      lastDate,
      nextDate,
    }];
  }).sort((left, right) => (
    left.nextDate.localeCompare(right.nextDate) || left.streamId.localeCompare(right.streamId)
  ));
}

function isSeasonActive(
  obligation: ReviewedRecurringObligation,
  date: string
): boolean {
  if (obligation.status === 'confirmed') return true;
  if (
    obligation.status !== 'seasonal' ||
    obligation.seasonStartMonth == null ||
    obligation.seasonEndMonth == null
  ) return false;
  const month = Number(date.slice(5, 7));
  return obligation.seasonStartMonth <= obligation.seasonEndMonth
    ? month >= obligation.seasonStartMonth && month <= obligation.seasonEndMonth
    : month >= obligation.seasonStartMonth || month <= obligation.seasonEndMonth;
}

function eventAmount(obligation: ReviewedRecurringObligation): number {
  const multiplier = obligation.cadence === 'weekly'
    ? 52 / 12
    : obligation.cadence === 'biweekly'
      ? 26 / 12
      : 1;
  return roundCurrency(obligation.expectedMonthlyAmount / multiplier);
}

function occurrenceDate(
  anchorDate: string,
  cadence: ReviewedRecurringObligation['cadence'],
  occurrence: number
): string {
  if (cadence === 'weekly') return addDays(anchorDate, 7 * occurrence);
  if (cadence === 'biweekly') return addDays(anchorDate, 14 * occurrence);
  return addMonths(anchorDate, occurrence);
}

function accountLabel(account: AccountBalanceRecord | undefined): string | null {
  if (!account) return null;
  return account.accountMask
    ? `${account.accountName} ••••${account.accountMask}`
    : account.accountName;
}

function scheduleBills(input: {
  transactions: NormalizedTransaction[];
  obligations: ReviewedRecurringObligation[];
  accounts: AccountBalanceRecord[];
  asOfDate: string;
  throughDate: string;
  forecastAccountId: string | null;
  balanceBasis: 'available' | 'current' | null;
}): ScheduledCashEvent[] {
  const accountsById = new Map(input.accounts.map(account => [account.accountId, account]));
  const pending = input.transactions.filter(transaction => transaction.pending && !transaction.removed);

  return input.obligations.flatMap(obligation => {
    if (obligation.status !== 'confirmed' && obligation.status !== 'seasonal') return [];
    const merchantKey = normalizedMerchant(obligation.merchant);
    const latestMatch = input.transactions
      .filter(transaction => (
        !transaction.removed &&
        !transaction.pending &&
        transaction.classification === 'spending' &&
        normalizedMerchant(transaction.normalizedMerchant) === merchantKey
      ))
      .sort((left, right) => right.normalizedDate.localeCompare(left.normalizedDate))[0];
    const accountId = latestMatch?.accountId || null;
    const account = accountId ? accountsById.get(accountId) : undefined;
    const amount = eventAmount(obligation);
    const events: ScheduledCashEvent[] = [];
    for (let occurrence = 1; occurrence < 120; occurrence += 1) {
      const date = occurrenceDate(obligation.lastChargeDate, obligation.cadence, occurrence);
      if (date <= input.asOfDate) continue;
      if (date > input.throughDate) break;
      const pendingMatch = pending.find(transaction => {
        const distance = daysBetween(transaction.normalizedDate, date);
        return (
          normalizedMerchant(transaction.normalizedMerchant) === merchantKey &&
          (!accountId || transaction.accountId === accountId) &&
          distance != null && Math.abs(distance) <= 3
        );
      });
      if (!isSeasonActive(obligation, date)) continue;
      if (pendingMatch && input.balanceBasis === 'available') continue;

      const pendingAmount = pendingMatch
        ? pendingMatch.spendingAdjustment > 0
          ? pendingMatch.spendingAdjustment
          : Math.abs(pendingMatch.cashFlowAmount)
        : null;
      const eventDate = pendingMatch
        ? pendingMatch.normalizedDate <= input.asOfDate
          ? addDays(input.asOfDate, 1)
          : pendingMatch.normalizedDate
        : date;
      if (eventDate <= input.throughDate) {
        events.push({
          eventId: `bill:${obligation.obligationId}:${eventDate}`,
          date: eventDate,
          kind: 'bill',
          direction: 'outflow',
          label: obligation.merchant,
          amount: pendingAmount && Number.isFinite(pendingAmount) ? roundCurrency(pendingAmount) : amount,
          accountId,
          accountName: accountLabel(account),
          affectsForecastBalance: Boolean(
            accountId &&
            accountId === input.forecastAccountId &&
            account?.accountType === 'depository'
          ),
        });
      }
    }
    return events;
  });
}

function selectForecastAccount(
  streams: PaycheckStream[],
  accounts: AccountBalanceRecord[]
): AccountBalanceRecord | null {
  const scoreByAccount = new Map<string, number>();
  for (const stream of streams) {
    scoreByAccount.set(
      stream.accountId,
      (scoreByAccount.get(stream.accountId) || 0) + stream.occurrenceCount
    );
  }
  const ranked = [...scoreByAccount.entries()].sort((left, right) => right[1] - left[1]);
  for (const [accountId] of ranked) {
    const account = accounts.find(item => item.accountId === accountId);
    if (account?.accountType === 'depository') return account;
  }
  return null;
}

export function buildCashFlowForecast(input: {
  transactions: NormalizedTransaction[];
  recurringObligations: ReviewedRecurringObligation[];
  accountBalances: AccountBalanceSummary;
  asOfDate: string;
  horizonDays?: number;
}): CashFlowForecast {
  if (dateToMs(input.asOfDate) == null) throw new Error('A valid as-of date is required.');
  const horizonDays = input.horizonDays ?? 30;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) {
    throw new Error('Forecast horizon must be between 1 and 90 days.');
  }
  const throughDate = addDays(input.asOfDate, horizonDays);
  const paycheckStreams = detectPaycheckStreams(input.transactions, input.asOfDate);
  const account = selectForecastAccount(paycheckStreams, input.accountBalances.accounts);
  const balanceBasis = account?.available != null
    ? 'available' as const
    : account?.current != null
      ? 'current' as const
      : null;
  const startingBalance = balanceBasis ? account?.[balanceBasis] ?? null : null;

  const billEvents = scheduleBills({
    transactions: input.transactions,
    obligations: input.recurringObligations,
    accounts: input.accountBalances.accounts,
    asOfDate: input.asOfDate,
    throughDate,
    forecastAccountId: account?.accountId || null,
    balanceBasis,
  });
  const paycheckEvents = paycheckStreams.flatMap(stream => {
    const events: ScheduledCashEvent[] = [];
    for (let date = stream.nextDate; date <= throughDate; date = addDays(date, 14)) {
      events.push({
        eventId: `paycheck:${stream.streamId}:${date}`,
        date,
        kind: 'paycheck',
        direction: 'inflow',
        label: stream.source,
        amount: stream.typicalAmount,
        accountId: stream.accountId,
        accountName: accountLabel(input.accountBalances.accounts.find(item => item.accountId === stream.accountId)),
        affectsForecastBalance: stream.accountId === account?.accountId,
      });
    }
    return events;
  });
  const scheduledEvents = [...paycheckEvents, ...billEvents].sort((left, right) => (
    left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label)
  ));
  const upcomingThrough = addDays(input.asOfDate, 7);
  const upcomingBills = billEvents.filter(event => event.date <= upcomingThrough);

  let status: CashFlowForecastStatus = 'ready';
  let warning: string | null = null;
  if (!paycheckStreams.length) {
    status = 'unavailable';
    warning = 'No current regular Verizon payroll schedule could be confirmed.';
  } else if (!account || startingBalance == null) {
    status = 'unavailable';
    warning = 'The payroll checking account does not have a usable balance yet.';
  } else if (account.balanceStatus !== 'fresh' || account.health !== 'healthy') {
    status = 'stale';
    warning = 'The payroll checking balance needs a fresh successful sync before it can be projected.';
  }

  const dailyBalances: DailyCashBalance[] = [];
  let runningBalance = startingBalance;
  if (status === 'ready' && runningBalance != null) {
    for (let offset = 0; offset <= horizonDays; offset += 1) {
      const date = addDays(input.asOfDate, offset);
      if (offset > 0) {
        for (const event of scheduledEvents.filter(item => item.date === date && item.affectsForecastBalance)) {
          runningBalance += event.direction === 'inflow' ? event.amount : -event.amount;
        }
      }
      dailyBalances.push({ date, balance: roundCurrency(runningBalance) });
    }
  }
  const minimum = dailyBalances.slice().sort((left, right) => left.balance - right.balance)[0];

  return {
    status,
    asOfDate: input.asOfDate,
    throughDate,
    balanceBasis,
    startingBalance,
    forecastAccount: account ? {
      accountId: account.accountId,
      institutionName: account.institutionName,
      accountName: account.accountName,
      accountMask: account.accountMask,
    } : null,
    paycheckStreams,
    upcomingBills,
    scheduledEvents,
    dailyBalances,
    minimumBalance: minimum?.balance ?? null,
    minimumBalanceDate: minimum?.date ?? null,
    warning,
  };
}
