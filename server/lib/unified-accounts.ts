import type { AccountBalanceRecord } from './account-balances';
import { buildAccountRoleView, type AccountRoleSummary, type AccountRoleView } from './account-role-view';
import type { ConnectedAccountRecord } from './connected-accounts';
import {
  findLinkedDuplicate,
  manualAccountRecords,
  type ManualAccountKind,
  type StoredManualAccount,
} from './manual-accounts';
import type { AccountRole } from './account-roles';

export type UnifiedAccount = AccountRoleView & {
  source: 'linked' | 'manual';
  manualKind: ManualAccountKind | null;
  includeInCash: boolean;
  includeInNetWorth: boolean;
  duplicateOfAccountId: string | null;
};

export function buildUnifiedAccountView(input: {
  linkedAccounts: readonly ConnectedAccountRecord[];
  linkedBalances: readonly AccountBalanceRecord[];
  manualAccounts: readonly StoredManualAccount[];
  overrides: ReadonlyMap<string, AccountRole>;
}): { accounts: UnifiedAccount[]; summary: AccountRoleSummary } {
  const manualRecords = input.manualAccounts.map(manualAccountRecords);
  const duplicateByManualId = new Map(input.manualAccounts.map(account => [
    account.accountId,
    findLinkedDuplicate(account, input.linkedAccounts, input.linkedBalances),
  ]));
  const duplicateIds = new Set([...duplicateByManualId.entries()].flatMap(
    ([accountId, duplicateOf]) => duplicateOf ? [accountId] : []
  ));
  const roleView = buildAccountRoleView({
    connectedAccounts: [
      ...input.linkedAccounts,
      ...manualRecords.map(record => record.account),
    ],
    balanceAccounts: [
      ...input.linkedBalances,
      ...manualRecords.map(record => record.balance),
    ],
    overrides: input.overrides,
    excludeAccountIdsFromSummary: duplicateIds,
  });
  const manualById = new Map(input.manualAccounts.map(account => [account.accountId, account]));

  return {
    accounts: roleView.accounts.map(account => {
      const manual = manualById.get(account.accountId);
      return {
        ...account,
        source: manual ? 'manual' : 'linked',
        manualKind: manual?.kind || null,
        includeInCash: manual ? manual.includeInCash : account.accountType === 'depository',
        includeInNetWorth: manual
          ? manual.includeInNetWorth
          : ['depository', 'investment', 'brokerage', 'credit', 'loan'].includes(account.accountType),
        duplicateOfAccountId: manual ? duplicateByManualId.get(account.accountId) || null : null,
      };
    }),
    summary: roleView.summary,
  };
}
