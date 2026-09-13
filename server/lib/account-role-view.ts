import type { AccountBalanceRecord } from './account-balances';
import type { ConnectedAccountRecord } from './connected-accounts';
import {
  ACCOUNT_ROLES,
  resolveAccountRole,
  type AccountRole,
  type AccountRoleSource,
} from './account-roles';

export type AccountRoleView = ConnectedAccountRecord & {
  role: AccountRole;
  roleSource: AccountRoleSource;
  defaultRole: AccountRole;
  suggestedRole: AccountRole | null;
  requiresRoleConfirmation: boolean;
  current: number | null;
  available: number | null;
  isoCurrencyCode: string | null;
  fetchedAt: string | null;
  balanceStatus: 'fresh' | 'stale' | 'missing';
};

export type AccountRoleBucket = {
  accountCount: number;
  knownBalanceCount: number;
  total: number | null;
};

export type AccountRoleSummary = {
  currency: string | null;
  buckets: Record<AccountRole, AccountRoleBucket>;
};

function emptyBuckets(): Record<AccountRole, AccountRoleBucket> {
  return Object.fromEntries(ACCOUNT_ROLES.map(role => [role, {
    accountCount: 0,
    knownBalanceCount: 0,
    total: null,
  }])) as Record<AccountRole, AccountRoleBucket>;
}

export function buildAccountRoleView(input: {
  connectedAccounts: readonly ConnectedAccountRecord[];
  balanceAccounts: readonly AccountBalanceRecord[];
  overrides: ReadonlyMap<string, AccountRole>;
}): { accounts: AccountRoleView[]; summary: AccountRoleSummary } {
  const balancesById = new Map(input.balanceAccounts.map(account => [account.accountId, account]));
  const accounts = input.connectedAccounts.map(account => {
    const balance = balancesById.get(account.accountId);
    const resolved = resolveAccountRole(
      account.accountType,
      account.accountSubtype,
      input.overrides.get(account.accountId)
    );
    return {
      ...account,
      role: resolved.role,
      roleSource: resolved.source,
      defaultRole: resolved.defaultRole,
      suggestedRole: resolved.suggestedRole,
      requiresRoleConfirmation: resolved.requiresConfirmation,
      current: balance?.current ?? null,
      available: balance?.available ?? null,
      isoCurrencyCode: balance?.isoCurrencyCode ?? null,
      fetchedAt: balance?.fetchedAt ?? null,
      balanceStatus: balance?.balanceStatus ?? 'missing',
    } satisfies AccountRoleView;
  });

  const currencies = new Set(accounts.flatMap(account => (
    account.current !== null && account.isoCurrencyCode ? [account.isoCurrencyCode] : []
  )));
  const currency = currencies.size === 1 ? [...currencies][0] : null;
  const buckets = emptyBuckets();
  for (const account of accounts) {
    const bucket = buckets[account.role];
    bucket.accountCount += 1;
    if (currency && account.isoCurrencyCode === currency && account.current !== null) {
      bucket.knownBalanceCount += 1;
      bucket.total = (bucket.total ?? 0) + account.current;
    }
  }

  return { accounts, summary: { currency, buckets } };
}
