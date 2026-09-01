export interface ConnectedAccountMetadata {
  id?: string | null;
  name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
  [key: string]: unknown;
}

export interface ConnectedItemMetadata {
  institutionName?: string | null;
  health: string;
  accounts?: readonly ConnectedAccountMetadata[] | null;
  [key: string]: unknown;
}

export interface ConnectedAccountRecord {
  accountId: string;
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: string;
  accountSubtype: string;
  health: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildConnectedAccounts(
  items: readonly ConnectedItemMetadata[]
): ConnectedAccountRecord[] {
  const connectedAccounts: ConnectedAccountRecord[] = [];

  for (const item of items) {
    if (!isNonEmptyString(item.institutionName) || !Array.isArray(item.accounts)) {
      continue;
    }

    for (const account of item.accounts) {
      if (!isNonEmptyString(account.id) || !isNonEmptyString(account.name)) {
        continue;
      }

      connectedAccounts.push({
        accountId: account.id,
        institutionName: item.institutionName,
        accountName: account.name,
        accountMask: isNonEmptyString(account.mask) ? account.mask : '',
        accountType: isNonEmptyString(account.type) ? account.type : '',
        accountSubtype: isNonEmptyString(account.subtype) ? account.subtype : '',
        health: item.health
      });
    }
  }

  return connectedAccounts;
}
