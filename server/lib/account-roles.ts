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
