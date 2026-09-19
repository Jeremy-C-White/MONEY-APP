import type { AccountBalanceRecord } from './account-balances';
import type { ConnectedAccountRecord } from './connected-accounts';

export const MANUAL_ACCOUNT_KINDS = [
  'savings',
  'retirement',
  'investment',
  'real_estate',
  'vehicle',
] as const;

export type ManualAccountKind = typeof MANUAL_ACCOUNT_KINDS[number];

export type StoredManualAccount = {
  accountId: string;
  source: 'manual';
  institutionName: string;
  accountName: string;
  accountMask: string;
  accountType: 'depository' | 'investment' | 'asset';
  accountSubtype: string;
  kind: ManualAccountKind;
  currentBalance: number;
  isoCurrencyCode: string;
  includeInCash: boolean;
  includeInNetWorth: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManualBalanceSnapshot = {
  accountId: string;
  balance: number;
  isoCurrencyCode: string;
  recordedAt: string;
  source: 'manual';
};

export class ManualAccountRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'ManualAccountRequestError';
  }
}

function nonEmptyString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ManualAccountRequestError(`${label} is required.`);
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length > maxLength) {
    throw new ManualAccountRequestError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function balanceValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000_000) {
    throw new ManualAccountRequestError('Balance must be a valid non-negative number.');
  }
  return value;
}

function currencyCode(value: unknown): string {
  const currency = typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ManualAccountRequestError('Currency must be a three-letter code.');
  }
  return currency;
}

function accountMask(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}$/.test(value.trim())) {
    throw new ManualAccountRequestError('Last four digits must contain exactly four numbers.');
  }
  return value.trim();
}

function kindConfig(kind: ManualAccountKind): Pick<StoredManualAccount,
  'accountType' | 'accountSubtype' | 'includeInCash' | 'includeInNetWorth'> {
  if (kind === 'savings') {
    return {
      accountType: 'depository',
      accountSubtype: 'savings',
      includeInCash: true,
      includeInNetWorth: true,
    };
  }
  if (kind === 'retirement') {
    return {
      accountType: 'investment',
      accountSubtype: 'retirement',
      includeInCash: false,
      includeInNetWorth: true,
    };
  }
  if (kind === 'real_estate' || kind === 'vehicle') {
    return {
      accountType: 'asset',
      accountSubtype: kind,
      includeInCash: false,
      includeInNetWorth: true,
    };
  }
  return {
    accountType: 'investment',
    accountSubtype: 'brokerage',
    includeInCash: false,
    includeInNetWorth: true,
  };
}

function parseKind(value: unknown): ManualAccountKind {
  if (typeof value !== 'string' || !MANUAL_ACCOUNT_KINDS.includes(value as ManualAccountKind)) {
    throw new ManualAccountRequestError(
      'Account kind must be savings, retirement, investment, real estate, or vehicle.'
    );
  }
  return value as ManualAccountKind;
}

export function buildManualAccount(input: unknown, accountId: string, now: string): StoredManualAccount {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ManualAccountRequestError('Manual account details are required.');
  }
  if (!/^manual_[a-f0-9-]{36}$/.test(accountId)) {
    throw new Error('A valid manual account ID is required.');
  }
  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.getTime())) throw new Error('A valid timestamp is required.');
  const record = input as Record<string, unknown>;
  const kind = parseKind(record.kind);

  return {
    accountId,
    source: 'manual',
    institutionName: nonEmptyString(record.institutionName, 'Institution', 80),
    accountName: nonEmptyString(record.accountName, 'Account name', 80),
    accountMask: accountMask(record.accountMask),
    kind,
    currentBalance: balanceValue(record.balance),
    isoCurrencyCode: currencyCode(record.isoCurrencyCode),
    ...kindConfig(kind),
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  };
}

export function parseManualBalanceInput(input: unknown): number {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ManualAccountRequestError('A balance is required.');
  }
  return balanceValue((input as Record<string, unknown>).balance);
}

export function parseStoredManualAccount(value: unknown): StoredManualAccount | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  try {
    const kind = parseKind(record.kind);
    const createdAt = new Date(String(record.createdAt || ''));
    const updatedAt = new Date(String(record.updatedAt || ''));
    if (
      record.source !== 'manual' ||
      typeof record.accountId !== 'string' || !/^manual_[a-f0-9-]{36}$/.test(record.accountId) ||
      Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime())
    ) return null;
    const config = kindConfig(kind);
    return {
      accountId: record.accountId,
      source: 'manual',
      institutionName: nonEmptyString(record.institutionName, 'Institution', 80),
      accountName: nonEmptyString(record.accountName, 'Account name', 80),
      accountMask: accountMask(record.accountMask),
      kind,
      currentBalance: balanceValue(record.currentBalance),
      isoCurrencyCode: currencyCode(record.isoCurrencyCode),
      ...config,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export function buildManualBalanceSnapshot(
  account: StoredManualAccount,
  balance: number,
  recordedAt: string
): ManualBalanceSnapshot {
  const timestamp = new Date(recordedAt);
  if (Number.isNaN(timestamp.getTime())) throw new Error('A valid snapshot time is required.');
  return {
    accountId: account.accountId,
    balance: balanceValue(balance),
    isoCurrencyCode: account.isoCurrencyCode,
    recordedAt: timestamp.toISOString(),
    source: 'manual',
  };
}

export function manualAccountRecords(account: StoredManualAccount): {
  account: ConnectedAccountRecord;
  balance: AccountBalanceRecord;
} {
  const shared = {
    accountId: account.accountId,
    institutionName: account.institutionName,
    accountName: account.accountName,
    accountMask: account.accountMask,
    accountType: account.accountType,
    accountSubtype: account.accountSubtype,
    health: 'manual',
  };
  return {
    account: shared,
    balance: {
      ...shared,
      current: account.currentBalance,
      available: null,
      limit: null,
      isoCurrencyCode: account.isoCurrencyCode,
      unofficialCurrencyCode: null,
      fetchedAt: account.updatedAt,
      balanceStatus: 'fresh',
    },
  };
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const GENERIC_INSTITUTION_WORDS = new Set([
  'bank', 'credit', 'union', 'financial', 'national', 'the', 'of', 'usa', 'na',
]);

function institutionTokens(value: string): Set<string> {
  return new Set(normalizeIdentity(value).split(' ').filter(token => (
    token.length > 2 && !GENERIC_INSTITUTION_WORDS.has(token)
  )));
}

export function findLinkedDuplicate(
  manual: StoredManualAccount,
  linkedAccounts: readonly ConnectedAccountRecord[],
  linkedBalances: readonly AccountBalanceRecord[]
): string | null {
  // Plaid-linked records are financial accounts, not household property. A
  // similarly named loan must never suppress the value of a home or vehicle.
  if (manual.accountType === 'asset') return null;

  const reportingIds = new Set(
    linkedBalances.filter(account => account.current !== null).map(account => account.accountId)
  );
  const institution = normalizeIdentity(manual.institutionName);
  const name = normalizeIdentity(manual.accountName);
  const manualInstitutionTokens = institutionTokens(manual.institutionName);

  const match = linkedAccounts.find(account => {
    if (!reportingIds.has(account.accountId)) return false;
    const sameName = normalizeIdentity(account.accountName) === name;
    const sameInstitution = normalizeIdentity(account.institutionName) === institution;
    const sameMask = Boolean(manual.accountMask && account.accountMask && manual.accountMask === account.accountMask);
    const sharedInstitutionTokens = [...manualInstitutionTokens].filter(
      token => institutionTokens(account.institutionName).has(token)
    ).length;
    const sameType = manual.accountType === account.accountType;
    return (
      (sameMask && sameType && (sameName || sameInstitution || sharedInstitutionTokens >= 1)) ||
      (sameName && (sameInstitution || sharedInstitutionTokens >= 2))
    );
  });
  return match?.accountId || null;
}
