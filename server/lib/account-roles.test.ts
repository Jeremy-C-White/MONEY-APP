import { describe, expect, it } from 'vitest';
import { deriveDefaultRole } from './account-roles';

describe('deriveDefaultRole', () => {
  it.each([
    ['depository', 'checking', 'operating'],
    ['depository', 'payroll', 'operating'],
    ['depository', 'savings', 'reserve'],
    ['depository', 'money_market', 'reserve'],
    ['depository', 'cd', 'reserve'],
    ['investment', '401k', 'retirement'],
    ['investment', '403B', 'retirement'],
    ['investment', 'roth_401k', 'retirement'],
    ['investment', 'ira', 'retirement'],
    ['investment', 'brokerage', 'investment'],
    ['brokerage', '', 'investment'],
    ['investment', 'hsa', 'health_savings'],
    ['depository', 'hsa', 'health_savings'],
    ['credit', 'credit card', 'debt'],
    ['loan', 'mortgage', 'debt'],
  ])('maps %s/%s to %s', (type, subtype, role) => {
    expect(deriveDefaultRole(type, subtype).role).toBe(role);
  });

  it.each(['paypal', 'prepaid', 'ebt'])('keeps depository/%s unassigned', subtype => {
    expect(deriveDefaultRole('depository', subtype)).toMatchObject({
      role: 'unassigned',
      suggestedRole: null,
      requiresConfirmation: true,
      reason: 'unsupported_cash_subtype',
    });
  });

  it('suggests operating for cash management but requires confirmation', () => {
    expect(deriveDefaultRole('depository', 'cash_management')).toEqual({
      role: 'unassigned',
      suggestedRole: 'operating',
      requiresConfirmation: true,
      reason: 'cash_management_needs_confirmation',
    });
  });

  it('keeps a depository account with no subtype visibly unresolved', () => {
    expect(deriveDefaultRole('depository', '')).toMatchObject({
      role: 'unassigned',
      requiresConfirmation: true,
      reason: 'missing_subtype',
    });
  });
});
