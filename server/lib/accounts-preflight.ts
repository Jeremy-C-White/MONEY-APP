export interface AccountsPreflightAccountMetadata {
  id?: string | null;
  account_id?: string | null;
}

export interface AccountsPreflightItemMetadata {
  institutionName?: string | null;
  health: string;
  accounts?: readonly AccountsPreflightAccountMetadata[] | null;
}

export interface AccountsPreflightTransactionMetadata {
  accountId?: string | null;
}

export interface AccountsPreflightReport {
  plaidItemCount: number;
  activeItemCount: number;
  disconnectedItemCount: number;
  activeItemsWithAccounts: number;
  activeItemsWithoutAccounts: number;
  uniquePersistedAccountIds: number;
  uniqueLedgerAccountIds: number;
  idsInBoth: number;
  persistedOnlyIds: number;
  ledgerOnlyIds: number;
  healthBreakdown: Record<string, number>;
  itemsWithMissingAccounts: Array<{ institutionName: string; health: string }>;
}

function accountId(account: AccountsPreflightAccountMetadata): string | null {
  for (const value of [account.id, account.account_id]) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

export function buildAccountsPreflightReport(
  items: readonly AccountsPreflightItemMetadata[],
  transactions: readonly AccountsPreflightTransactionMetadata[]
): AccountsPreflightReport {
  let activeItemCount = 0;
  let disconnectedItemCount = 0;
  let activeItemsWithAccounts = 0;
  let activeItemsWithoutAccounts = 0;
  const healthBreakdown: Record<string, number> = {};
  const itemsWithMissingAccounts: Array<{ institutionName: string; health: string }> = [];
  const persistedAccountIds = new Set<string>();

  for (const item of items) {
    healthBreakdown[item.health] = (healthBreakdown[item.health] || 0) + 1;

    if (Array.isArray(item.accounts)) {
      for (const account of item.accounts) {
        const id = accountId(account);
        if (id) persistedAccountIds.add(id);
      }
    }

    if (item.health === 'disconnected') {
      disconnectedItemCount++;
      continue;
    }

    activeItemCount++;
    if (Array.isArray(item.accounts) && item.accounts.length > 0) {
      activeItemsWithAccounts++;
    } else {
      activeItemsWithoutAccounts++;
      itemsWithMissingAccounts.push({
        institutionName: item.institutionName || 'Unknown',
        health: item.health
      });
    }
  }

  const ledgerAccountIds = new Set<string>();
  for (const transaction of transactions) {
    if (typeof transaction.accountId === 'string' && transaction.accountId.trim().length > 0) {
      ledgerAccountIds.add(transaction.accountId);
    }
  }

  let idsInBoth = 0;
  let persistedOnlyIds = 0;
  let ledgerOnlyIds = 0;

  for (const id of persistedAccountIds) {
    if (ledgerAccountIds.has(id)) idsInBoth++;
    else persistedOnlyIds++;
  }
  for (const id of ledgerAccountIds) {
    if (!persistedAccountIds.has(id)) ledgerOnlyIds++;
  }

  return {
    plaidItemCount: items.length,
    activeItemCount,
    disconnectedItemCount,
    activeItemsWithAccounts,
    activeItemsWithoutAccounts,
    uniquePersistedAccountIds: persistedAccountIds.size,
    uniqueLedgerAccountIds: ledgerAccountIds.size,
    idsInBoth,
    persistedOnlyIds,
    ledgerOnlyIds,
    healthBreakdown,
    itemsWithMissingAccounts
  };
}
