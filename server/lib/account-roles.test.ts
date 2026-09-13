import { describe, expect, it } from 'vitest';
import {
  buildAccountRoleDocumentId,
  deriveDefaultRole,
  parseStoredAccountRoleOverride,
  parseAccountRoleInput,
  resolveAccountRole,
} from './account-roles';

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

  it('lets an owner override the evidence-based default without changing it', () => {
    expect(resolveAccountRole('depository', 'savings', 'operating')).toMatchObject({
      role: 'operating',
      source: 'owner',
      defaultRole: 'reserve',
      requiresConfirmation: false,
    });
  });

  it('keeps cash management unresolved until the owner confirms its role', () => {
    expect(resolveAccountRole('depository', 'cash_management')).toMatchObject({
      role: 'unassigned',
      source: 'default',
      suggestedRole: 'operating',
      requiresConfirmation: true,
    });
    expect(resolveAccountRole('depository', 'cash_management', 'operating')).toMatchObject({
      role: 'operating',
      source: 'owner',
      requiresConfirmation: false,
    });
  });

  it('parses only complete stored overrides', () => {
    expect(parseStoredAccountRoleOverride({ accountId: ' account-1 ', role: 'reserve' }))
      .toEqual({ accountId: 'account-1', role: 'reserve' });
    expect(parseStoredAccountRoleOverride({ accountId: '', role: 'reserve' })).toBeNull();
    expect(parseStoredAccountRoleOverride({ accountId: 'account-1', role: 'cash' })).toBeNull();
  });

  it('uses a stable Firestore-safe document id', () => {
    expect(buildAccountRoleDocumentId('account/with/slashes')).toMatch(/^[a-f0-9]{24}$/);
    expect(buildAccountRoleDocumentId('account-1')).toBe(buildAccountRoleDocumentId('account-1'));
  });

  it('accepts explicit roles and null for restoring the automatic role', () => {
    expect(parseAccountRoleInput('retirement')).toBe('retirement');
    expect(parseAccountRoleInput(null)).toBeNull();
    expect(() => parseAccountRoleInput('cash')).toThrow('Choose a valid account role');
  });
});
