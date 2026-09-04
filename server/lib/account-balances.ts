export const BALANCE_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export interface PlaidBalanceAccountMetadata {
  id?: string | null;
  account_id?: string | null;
  name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  balances?: {
    current?: number | null;
    available?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  } | null;
  [key: string]: unknown;
}

export interface StoredBalanceAccount {
  accountId: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  current: number | null;
  available: number | null;
  limit: number | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
}

export interface StoredItemBalanceSnapshot {
  institutionName: string;
  fetchedAt: string;
  source: 'plaid_accounts_get';
  accounts: StoredBalanceAccount[];
}

export interface BalanceItemMetadata {
  itemId: string;
  institutionName?: string | null;
  health: string;
  accounts?: readonly PlaidBalanceAccountMetadata[] | null;
  balanceSnapshot?: Partial<StoredItemBalanceSnapshot> | null;
}

export type AccountBalanceStatus = 'fresh' | 'stale' | 'missing';

export interface AccountBalanceRecord extends StoredBalanceAccount {
  institutionName: string;
  health: string;
  fetchedAt: string | null;
  balanceStatus: AccountBalanceStatus;
}

export interface AccountBalanceIssue {
  itemId: string;
  institutionName: string;
  reason: 'missing' | 'stale' | 'connection';
}

export interface AccountBalanceSummary {
  status: 'complete' | 'partial' | 'unavailable';
  currency: string | null;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  connectedItemCount: number;
  reportingItemCount: number;
  freshItemCount: number;
  missingCurrentBalanceCount: number;
  currencyIssueCount: number;
  cashCurrent: number | null;
  cashAvailable: number | null;
  creditBalance: number | null;
  creditOwed: number | null;
  creditCredits: number | null;
  loanBalance: number | null;
  investmentValue: number | null;
  connectedPosition: number | null;
  issues: AccountBalanceIssue[];
  accounts: AccountBalanceRecord[];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function accountId(account: PlaidBalanceAccountMetadata): string | null {
  return nonEmptyString(account.id) || nonEmptyString(account.account_id);
}

function mapBalanceAccount(account: PlaidBalanceAccountMetadata): StoredBalanceAccount | null {
  const id = accountId(account);
  const name = nonEmptyString(account.name);
  if (!id || !name) return null;

  return {
    accountId: id,
    accountName: name,
    accountMask: nonEmptyString(account.mask) || '',
    accountType: nonEmptyString(account.type) || '',
    accountSubtype: nonEmptyString(account.subtype) || '',
    current: finiteNumberOrNull(account.balances?.current),
    available: finiteNumberOrNull(account.balances?.available),
    limit: finiteNumberOrNull(account.balances?.limit),
    isoCurrencyCode: nonEmptyString(account.balances?.iso_currency_code),
    unofficialCurrencyCode: nonEmptyString(account.balances?.unofficial_currency_code),
  };
}

export function buildStoredBalanceSnapshot(input: {
  institutionName: unknown;
  fetchedAt: string;
  accounts: readonly PlaidBalanceAccountMetadata[] | null | undefined;
}): StoredItemBalanceSnapshot | null {
  const institutionName = nonEmptyString(input.institutionName);
  const fetchedAt = new Date(input.fetchedAt);
  if (!institutionName || Number.isNaN(fetchedAt.getTime()) || !Array.isArray(input.accounts)) {
    return null;
  }

  return {
    institutionName,
    fetchedAt: fetchedAt.toISOString(),
    source: 'plaid_accounts_get',
    accounts: input.accounts.flatMap(account => {
      const mapped = mapBalanceAccount(account);
      return mapped ? [mapped] : [];
    }),
  };
}

function parseSnapshot(
  snapshot: Partial<StoredItemBalanceSnapshot> | null | undefined
): StoredItemBalanceSnapshot | null {
  if (
    !snapshot ||
    snapshot.source !== 'plaid_accounts_get' ||
    !Array.isArray(snapshot.accounts)
  ) {
    return null;
  }

  return buildStoredBalanceSnapshot({
    institutionName: snapshot.institutionName,
    fetchedAt: String(snapshot.fetchedAt || ''),
    accounts: snapshot.accounts.map(account => ({
      id: account.accountId,
      name: account.accountName,
      mask: account.accountMask,
      type: account.accountType,
      subtype: account.accountSubtype,
      balances: {
        current: account.current,
        available: account.available,
        limit: account.limit,
        iso_currency_code: account.isoCurrencyCode,
        unofficial_currency_code: account.unofficialCurrencyCode,
      },
    })),
  });
}

function itemBalanceStatus(
  snapshot: StoredItemBalanceSnapshot | null,
  nowMs: number,
  staleAfterMs: number
): AccountBalanceStatus {
  if (!snapshot || snapshot.accounts.length === 0) return 'missing';
  return nowMs - new Date(snapshot.fetchedAt).getTime() > staleAfterMs ? 'stale' : 'fresh';
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

export function buildAccountBalanceSummary(
  items: readonly BalanceItemMetadata[],
  now: string,
  staleAfterMs = BALANCE_STALE_AFTER_MS
): AccountBalanceSummary {
  const nowMs = new Date(now).getTime();
  if (Number.isNaN(nowMs)) throw new Error('A valid balance summary time is required.');

  const connectedItems = items.filter(item => item.health !== 'disconnected');
  const issues: AccountBalanceIssue[] = [];
  const accounts: AccountBalanceRecord[] = [];
  let reportingItemCount = 0;
  let freshItemCount = 0;

  for (const item of connectedItems) {
    const institutionName = nonEmptyString(item.institutionName) || 'Unknown institution';
    const snapshot = parseSnapshot(item.balanceSnapshot);
    const balanceStatus = itemBalanceStatus(snapshot, nowMs, staleAfterMs);
    const connectionNeedsAttention = item.health !== 'healthy';

    if (snapshot?.accounts.length) reportingItemCount += 1;
    if (balanceStatus === 'fresh') freshItemCount += 1;

    if (connectionNeedsAttention) {
      issues.push({ itemId: item.itemId, institutionName, reason: 'connection' });
    } else if (balanceStatus !== 'fresh') {
      issues.push({ itemId: item.itemId, institutionName, reason: balanceStatus });
    }

    const snapshotById = new Map(
      (snapshot?.accounts || []).map(account => [account.accountId, account])
    );
    const inventoryAccounts = Array.isArray(item.accounts) ? item.accounts : [];
    const inventoryById = new Map<string, PlaidBalanceAccountMetadata>();
    for (const account of inventoryAccounts) {
      const id = accountId(account);
      if (id) inventoryById.set(id, account);
    }
    const ids = new Set([...inventoryById.keys(), ...snapshotById.keys()]);

    for (const id of ids) {
      const balanceAccount = snapshotById.get(id);
      const fallback = inventoryById.get(id);
      const mappedFallback = fallback ? mapBalanceAccount(fallback) : null;
      const account = balanceAccount || mappedFallback;
      if (!account) continue;

      accounts.push({
        ...account,
        institutionName,
        health: item.health,
        fetchedAt: balanceAccount ? snapshot?.fetchedAt || null : null,
        balanceStatus: balanceAccount ? balanceStatus : 'missing',
      });
    }
  }

  accounts.sort((left, right) => (
    left.institutionName.localeCompare(right.institutionName) ||
    left.accountName.localeCompare(right.accountName) ||
    left.accountId.localeCompare(right.accountId)
  ));

  const currencies = new Set(
    accounts.flatMap(account => account.isoCurrencyCode ? [account.isoCurrencyCode] : [])
  );
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const included = accounts.filter(account => account.isoCurrencyCode === currency && currency !== null);
  const relevant = accounts.filter(account => (
    ['depository', 'credit', 'loan', 'investment', 'brokerage'].includes(account.accountType)
  ));
  const missingCurrentBalanceCount = relevant.filter(account => account.current === null).length;
  const currencyIssueCount = accounts.filter(account => (
    account.current !== null && (!account.isoCurrencyCode || account.isoCurrencyCode !== currency)
  )).length;

  const cashAccounts = included.filter(account => account.accountType === 'depository');
  const creditAccounts = included.filter(account => account.accountType === 'credit');
  const loanAccounts = included.filter(account => account.accountType === 'loan');
  const investmentAccounts = included.filter(account => (
    account.accountType === 'investment' || account.accountType === 'brokerage'
  ));

  const cashCurrent = sumKnown(cashAccounts.map(account => account.current));
  const cashAvailable = cashAccounts.length > 0 && cashAccounts.every(account => account.available !== null)
    ? cashAccounts.reduce((total, account) => total + (account.available as number), 0)
    : null;
  const creditBalance = sumKnown(creditAccounts.map(account => account.current));
  const hasKnownCreditBalance = creditAccounts.some(account => account.current !== null);
  const creditOwed = hasKnownCreditBalance
    ? creditAccounts.reduce((total, account) => (
        total + (account.current !== null && account.current > 0 ? account.current : 0)
      ), 0)
    : null;
  const creditCredits = hasKnownCreditBalance
    ? creditAccounts.reduce((total, account) => (
        total + (account.current !== null && account.current < 0 ? -account.current : 0)
      ), 0)
    : null;
  const loanBalance = sumKnown(loanAccounts.map(account => account.current));
  const investmentValue = sumKnown(investmentAccounts.map(account => account.current));
  const positionParts = [cashCurrent, investmentValue, creditBalance === null ? null : -creditBalance, loanBalance === null ? null : -loanBalance]
    .filter((value): value is number => value !== null);
  const connectedPosition = positionParts.length
    ? positionParts.reduce((total, value) => total + value, 0)
    : null;

  const timestamps = connectedItems.flatMap(item => {
    const parsed = parseSnapshot(item.balanceSnapshot);
    return parsed ? [parsed.fetchedAt] : [];
  }).sort();
  const complete = connectedItems.length > 0 &&
    freshItemCount === connectedItems.length &&
    missingCurrentBalanceCount === 0 &&
    currencyIssueCount === 0 &&
    issues.length === 0;

  return {
    status: accounts.some(account => account.current !== null)
      ? (complete ? 'complete' : 'partial')
      : 'unavailable',
    currency,
    oldestFetchedAt: timestamps[0] || null,
    newestFetchedAt: timestamps[timestamps.length - 1] || null,
    connectedItemCount: connectedItems.length,
    reportingItemCount,
    freshItemCount,
    missingCurrentBalanceCount,
    currencyIssueCount,
    cashCurrent,
    cashAvailable,
    creditBalance,
    creditOwed,
    creditCredits,
    loanBalance,
    investmentValue,
    connectedPosition,
    issues,
    accounts,
  };
}
