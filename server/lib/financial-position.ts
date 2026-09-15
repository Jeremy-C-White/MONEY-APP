import type { UnifiedAccount } from './unified-accounts';

export type RetirementHistoryPoint = {
  date: string;
  total: number;
};

export type NetWorthHistoryPoint = {
  date: string;
  estimatedNetWorth: number | null;
  liquidCash: number | null;
  coveredAccountCount: number;
  expectedAccountCount: number;
  status: 'complete' | 'partial';
};

export type FinancialPosition = {
  currency: string | null;
  mixedCurrency: boolean;
  liquidCash: number | null;
  liquidSavings: number | null;
  estimatedNetWorth: number | null;
  includedAccountCount: number;
  knownBalanceCount: number;
  excludedDuplicateCount: number;
  netWorthHistory: NetWorthHistoryPoint[];
  retirement: {
    total: number | null;
    accountCount: number;
    knownBalanceCount: number;
    shareOfNetWorth: number | null;
    history: RetirementHistoryPoint[];
    trend: {
      startDate: string;
      endDate: string;
      change: number;
      percentageChange: number | null;
    } | null;
    contributionDataAvailable: false;
  };
};

export type StoredDailyBalanceSnapshot = {
  date?: unknown;
  items?: unknown;
  manualAccounts?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sum(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function netWorthValue(account: UnifiedAccount): number | null {
  if (account.current === null || !account.includeInNetWorth || account.duplicateOfAccountId) return null;
  return account.accountType === 'credit' || account.accountType === 'loan' || account.role === 'debt'
    ? -account.current
    : account.current;
}

function snapshotBalances(snapshot: StoredDailyBalanceSnapshot): Map<string, {
  balance: number;
  currency: string | null;
}> {
  const balances = new Map<string, { balance: number; currency: string | null }>();
  if (isRecord(snapshot.items)) {
    for (const item of Object.values(snapshot.items)) {
      if (!isRecord(item) || !Array.isArray(item.accounts)) continue;
      for (const account of item.accounts) {
        if (!isRecord(account)) continue;
        const accountId = nonEmptyString(account.accountId);
        const balance = finiteNumber(account.current);
        if (!accountId || balance === null) continue;
        balances.set(accountId, {
          balance,
          currency: nonEmptyString(account.isoCurrencyCode),
        });
      }
    }
  }
  if (isRecord(snapshot.manualAccounts)) {
    for (const [key, value] of Object.entries(snapshot.manualAccounts)) {
      if (!isRecord(value)) continue;
      const accountId = nonEmptyString(value.accountId) || key;
      const balance = finiteNumber(value.balance);
      if (!accountId || balance === null) continue;
      balances.set(accountId, {
        balance,
        currency: nonEmptyString(value.isoCurrencyCode),
      });
    }
  }
  return balances;
}

function buildRetirementHistory(
  accounts: readonly UnifiedAccount[],
  snapshots: readonly StoredDailyBalanceSnapshot[],
  currency: string | null
): RetirementHistoryPoint[] {
  if (!currency) return [];
  const expectedIds = accounts.filter(account => (
    account.role === 'retirement' &&
    account.includeInNetWorth &&
    !account.duplicateOfAccountId &&
    account.current !== null &&
    account.isoCurrencyCode === currency
  )).map(account => account.accountId);
  if (!expectedIds.length) return [];

  return snapshots.flatMap(snapshot => {
    const date = nonEmptyString(snapshot.date);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const balances = snapshotBalances(snapshot);
    const values = expectedIds.map(accountId => balances.get(accountId));
    if (values.some(value => !value || value.currency !== currency)) return [];
    return [{
      date,
      total: values.reduce((total, value) => total + (value?.balance || 0), 0),
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function buildNetWorthHistory(
  accounts: readonly UnifiedAccount[],
  snapshots: readonly StoredDailyBalanceSnapshot[],
  currency: string | null
): NetWorthHistoryPoint[] {
  if (!currency) return [];
  const expected = accounts.filter(account => (
    account.includeInNetWorth &&
    !account.duplicateOfAccountId &&
    account.current !== null &&
    account.isoCurrencyCode === currency
  ));
  if (!expected.length) return [];
  const liquidIds = new Set(expected.filter(account => (
    account.accountType === 'depository' &&
    account.includeInCash &&
    (account.role === 'operating' || account.role === 'reserve')
  )).map(account => account.accountId));

  return snapshots.flatMap(snapshot => {
    const date = nonEmptyString(snapshot.date);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const balances = snapshotBalances(snapshot);
    const covered = expected.filter(account => {
      const value = balances.get(account.accountId);
      return value?.currency === currency;
    });
    const complete = covered.length === expected.length;
    const netWorth = complete
      ? covered.reduce((total, account) => {
          const balance = balances.get(account.accountId)?.balance || 0;
          return total + (
            account.accountType === 'credit' || account.accountType === 'loan' || account.role === 'debt'
              ? -balance
              : balance
          );
        }, 0)
      : null;
    const liquidAccounts = expected.filter(account => liquidIds.has(account.accountId));
    const liquidComplete = liquidAccounts.every(account => balances.get(account.accountId)?.currency === currency);
    const liquidCash = liquidComplete && liquidAccounts.length
      ? liquidAccounts.reduce((total, account) => total + (balances.get(account.accountId)?.balance || 0), 0)
      : null;
    return [{
      date,
      estimatedNetWorth: netWorth,
      liquidCash,
      coveredAccountCount: covered.length,
      expectedAccountCount: expected.length,
      status: complete ? 'complete' as const : 'partial' as const,
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

export function buildFinancialPosition(input: {
  accounts: readonly UnifiedAccount[];
  balanceSnapshots?: readonly StoredDailyBalanceSnapshot[];
}): FinancialPosition {
  const included = input.accounts.filter(account => (
    account.includeInNetWorth && !account.duplicateOfAccountId
  ));
  const known = included.filter(account => account.current !== null);
  const currencies = new Set(known.flatMap(account => (
    account.isoCurrencyCode ? [account.isoCurrencyCode] : []
  )));
  const missingCurrency = known.some(account => !account.isoCurrencyCode);
  const mixedCurrency = currencies.size > 1 || missingCurrency;
  const currency = currencies.size === 1 && !missingCurrency ? [...currencies][0] : null;

  const liquidAccounts = known.filter(account => (
    account.accountType === 'depository' &&
    account.includeInCash &&
    (account.role === 'operating' || account.role === 'reserve')
  ));
  const savingsAccounts = liquidAccounts.filter(account => account.role === 'reserve');
  const retirementAccounts = included.filter(account => account.role === 'retirement');
  const knownRetirementAccounts = retirementAccounts.filter(account => account.current !== null);

  const liquidCash = currency && !mixedCurrency
    ? sum(liquidAccounts.filter(account => account.isoCurrencyCode === currency).map(account => account.current as number))
    : null;
  const liquidSavings = currency && !mixedCurrency
    ? sum(savingsAccounts.filter(account => account.isoCurrencyCode === currency).map(account => account.current as number))
    : null;
  const estimatedNetWorth = currency && !mixedCurrency
    ? sum(known.filter(account => account.isoCurrencyCode === currency).flatMap(account => {
        const value = netWorthValue(account);
        return value === null ? [] : [value];
      }))
    : null;
  const retirementTotal = currency && !mixedCurrency
    ? sum(knownRetirementAccounts
        .filter(account => account.isoCurrencyCode === currency)
        .map(account => account.current as number))
    : null;
  const history = buildRetirementHistory(input.accounts, input.balanceSnapshots || [], currency);
  const netWorthHistory = buildNetWorthHistory(input.accounts, input.balanceSnapshots || [], currency);
  const first = history[0];
  const last = history[history.length - 1];
  const change = first && last && first.date !== last.date ? last.total - first.total : null;

  return {
    currency,
    mixedCurrency,
    liquidCash,
    liquidSavings,
    estimatedNetWorth,
    includedAccountCount: included.length,
    knownBalanceCount: known.length,
    excludedDuplicateCount: input.accounts.filter(account => Boolean(account.duplicateOfAccountId)).length,
    netWorthHistory,
    retirement: {
      total: retirementTotal,
      accountCount: retirementAccounts.length,
      knownBalanceCount: knownRetirementAccounts.length,
      shareOfNetWorth: retirementTotal !== null && estimatedNetWorth !== null && estimatedNetWorth > 0
        ? retirementTotal / estimatedNetWorth
        : null,
      history,
      trend: change === null ? null : {
        startDate: first.date,
        endDate: last.date,
        change,
        percentageChange: first.total !== 0 ? change / first.total : null,
      },
      contributionDataAvailable: false,
    },
  };
}
