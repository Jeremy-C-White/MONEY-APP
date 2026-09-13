import { createHash } from 'node:crypto';

export type AccountRole =
  | 'operating'
  | 'reserve'
  | 'retirement'
  | 'investment'
  | 'health_savings'
  | 'debt'
  | 'unassigned';

export type AccountRoleReason =
  | 'checking'
  | 'payroll'
  | 'cash_management_needs_confirmation'
  | 'reserve_cash'
  | 'retirement_account'
  | 'investment_account'
  | 'health_savings_account'
  | 'debt_account'
  | 'unsupported_cash_subtype'
  | 'missing_subtype'
  | 'unknown_account';

export type DefaultAccountRole = {
  role: AccountRole;
  suggestedRole: AccountRole | null;
  requiresConfirmation: boolean;
  reason: AccountRoleReason;
};

export type AccountRoleSource = 'default' | 'owner';

export type ResolvedAccountRole = DefaultAccountRole & {
  source: AccountRoleSource;
  defaultRole: AccountRole;
};

export type StoredAccountRoleOverride = {
  accountId: string;
  role: AccountRole;
};

export const ACCOUNT_ROLES: readonly AccountRole[] = [
  'operating',
  'reserve',
  'retirement',
  'investment',
  'health_savings',
  'debt',
  'unassigned',
];

const RETIREMENT_SUBTYPES = new Set([
  '401a',
  '401k',
  '403b',
  '457b',
  'ira',
  'keogh',
  'lira',
  'lif',
  'lrif',
  'lrsp',
  'pension',
  'prif',
  'profit sharing plan',
  'qshr',
  'retirement',
  'rlif',
  'roth',
  'roth 401k',
  'roth 403b',
  'roth 457b',
  'roth pension',
  'roth profit sharing plan',
  'roth thrift savings plan',
  'rrif',
  'rrsp',
  'sarsep',
  'sep ira',
  'simple ira',
  'sipp',
  'thrift savings plan',
]);

const RESERVE_SUBTYPES = new Set(['savings', 'money market', 'cd']);
const UNRESOLVED_DEPOSITORY_SUBTYPES = new Set(['paypal', 'prepaid', 'ebt']);

function normalize(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Evidence-based role defaults shared by every account reader. A role that
 * depends on how the owner actually uses the account remains unassigned until
 * the owner confirms it; suggestedRole describes the proposed choice.
 */
export function deriveDefaultRole(
  accountType: string | null | undefined,
  accountSubtype: string | null | undefined
): DefaultAccountRole {
  const type = normalize(accountType);
  const subtype = normalize(accountSubtype);

  if (type === 'credit' || type === 'loan') {
    return { role: 'debt', suggestedRole: null, requiresConfirmation: false, reason: 'debt_account' };
  }

  if (subtype === 'hsa') {
    return {
      role: 'health_savings',
      suggestedRole: null,
      requiresConfirmation: false,
      reason: 'health_savings_account',
    };
  }

  if (RETIREMENT_SUBTYPES.has(subtype)) {
    return {
      role: 'retirement',
      suggestedRole: null,
      requiresConfirmation: false,
      reason: 'retirement_account',
    };
  }

  if (type === 'investment' || type === 'brokerage') {
    return {
      role: 'investment',
      suggestedRole: null,
      requiresConfirmation: false,
      reason: 'investment_account',
    };
  }

  if (type === 'depository') {
    if (!subtype) {
      return {
        role: 'unassigned',
        suggestedRole: null,
        requiresConfirmation: true,
        reason: 'missing_subtype',
      };
    }
    if (subtype === 'checking') {
      return { role: 'operating', suggestedRole: null, requiresConfirmation: false, reason: 'checking' };
    }
    if (subtype === 'payroll') {
      return { role: 'operating', suggestedRole: null, requiresConfirmation: false, reason: 'payroll' };
    }
    if (RESERVE_SUBTYPES.has(subtype)) {
      return { role: 'reserve', suggestedRole: null, requiresConfirmation: false, reason: 'reserve_cash' };
    }
    if (subtype === 'cash management') {
      return {
        role: 'unassigned',
        suggestedRole: 'operating',
        requiresConfirmation: true,
        reason: 'cash_management_needs_confirmation',
      };
    }
    if (UNRESOLVED_DEPOSITORY_SUBTYPES.has(subtype)) {
      return {
        role: 'unassigned',
        suggestedRole: null,
        requiresConfirmation: true,
        reason: 'unsupported_cash_subtype',
      };
    }
  }

  return {
    role: 'unassigned',
    suggestedRole: null,
    requiresConfirmation: true,
    reason: 'unknown_account',
  };
}

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && ACCOUNT_ROLES.includes(value as AccountRole);
}

export function parseStoredAccountRoleOverride(value: unknown): StoredAccountRoleOverride | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.accountId !== 'string' || !record.accountId.trim() || !isAccountRole(record.role)) {
    return null;
  }
  return { accountId: record.accountId.trim(), role: record.role };
}

export function resolveAccountRole(
  accountType: string | null | undefined,
  accountSubtype: string | null | undefined,
  ownerRole?: AccountRole | null
): ResolvedAccountRole {
  const derived = deriveDefaultRole(accountType, accountSubtype);
  if (ownerRole && isAccountRole(ownerRole)) {
    return {
      role: ownerRole,
      source: 'owner',
      defaultRole: derived.role,
      suggestedRole: derived.suggestedRole,
      requiresConfirmation: false,
      reason: derived.reason,
    };
  }
  return {
    ...derived,
    source: 'default',
    defaultRole: derived.role,
  };
}

export function buildAccountRoleDocumentId(accountId: string): string {
  return createHash('sha256').update(accountId).digest('hex').slice(0, 24);
}

export class AccountRoleRequestError extends Error {}

export function parseAccountRoleInput(value: unknown): AccountRole | null {
  if (value === null) return null;
  if (!isAccountRole(value)) {
    throw new AccountRoleRequestError('Choose a valid account role or restore the automatic role.');
  }
  return value;
}
