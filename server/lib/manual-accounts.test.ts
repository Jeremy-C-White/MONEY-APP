import { describe, expect, it } from 'vitest';
import type { AccountBalanceRecord } from './account-balances';
import type { ConnectedAccountRecord } from './connected-accounts';
import {
  buildManualAccount,
  buildManualBalanceSnapshot,
  findLinkedDuplicate,
  parseManualBalanceInput,
  parseStoredManualAccount,
} from './manual-accounts';

const id = 'manual_12345678-1234-1234-1234-123456789abc';
const now = '2026-09-14T18:00:00.000Z';

describe('manual accounts', () => {
  it('creates a savings asset with cash and net-worth inclusion', () => {
    const account = buildManualAccount({
      institutionName: 'Apple / Goldman Sachs',
      accountName: 'Apple Savings',
      accountMask: '1234',
      kind: 'savings',
      balance: 32450.18,
      isoCurrencyCode: 'usd',
    }, id, now);

    expect(account).toMatchObject({
      source: 'manual',
      accountType: 'depository',
      accountSubtype: 'savings',
      currentBalance: 32450.18,
      isoCurrencyCode: 'USD',
      includeInCash: true,
      includeInNetWorth: true,
    });
    expect(parseStoredManualAccount(account)).toEqual(account);
  });

  it('keeps retirement assets out of liquid cash', () => {
    const account = buildManualAccount({
      institutionName: 'Employer plan',
      accountName: '401(k)',
      kind: 'retirement',
      balance: 25000,
    }, id, now);
    expect(account).toMatchObject({
      accountType: 'investment',
      accountSubtype: 'retirement',
      includeInCash: false,
      includeInNetWorth: true,
    });
  });

  it.each([
    ['real_estate', 'real_estate'],
    ['vehicle', 'vehicle'],
  ] as const)('treats %s as a net-worth asset, not cash', (kind, accountSubtype) => {
    const account = buildManualAccount({
      institutionName: kind === 'real_estate' ? 'Property' : 'Vehicles',
      accountName: kind === 'real_estate' ? 'Primary home' : 'Lexus TX',
      kind,
      balance: 50000,
    }, id, now);

    expect(account).toMatchObject({
      accountType: 'asset',
      accountSubtype,
      includeInCash: false,
      includeInNetWorth: true,
    });
    expect(parseStoredManualAccount(account)).toEqual(account);
  });

  it('rejects malformed balances and preserves exact snapshot values', () => {
    expect(() => parseManualBalanceInput({ balance: -1 })).toThrow('non-negative');
    expect(() => parseManualBalanceInput({ balance: '100' })).toThrow('non-negative');
    const account = buildManualAccount({
      institutionName: 'Apple', accountName: 'Savings', kind: 'savings', balance: 1,
    }, id, now);
    expect(buildManualBalanceSnapshot(account, 1234.567, now)).toEqual({
      accountId: id,
      balance: 1234.567,
      isoCurrencyCode: 'USD',
      recordedAt: now,
      source: 'manual',
    });
  });

  it('detects a reporting linked-account duplicate by identity', () => {
    const manual = buildManualAccount({
      institutionName: 'Goldman Sachs', accountName: 'Apple Savings', kind: 'savings', balance: 10,
    }, id, now);
    const linked: ConnectedAccountRecord = {
      accountId: 'linked-1', institutionName: 'Goldman Sachs', accountName: 'Apple Savings',
      accountMask: '', accountType: 'depository', accountSubtype: 'savings', health: 'healthy',
    };
    const balance = {
      ...linked, current: 10, available: 10, limit: null, isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null, fetchedAt: now, balanceStatus: 'fresh',
    } satisfies AccountBalanceRecord;
    expect(findLinkedDuplicate(manual, [linked], [balance])).toBe('linked-1');
    expect(findLinkedDuplicate(manual, [linked], [{ ...balance, current: null }])).toBeNull();
  });

  it('matches common institution naming variants without relying on generic bank words', () => {
    const manual = buildManualAccount({
      institutionName: 'Apple / Goldman Sachs', accountName: 'Apple Savings', kind: 'savings', balance: 10,
    }, id, now);
    const linked: ConnectedAccountRecord = {
      accountId: 'linked-1', institutionName: 'Goldman Sachs Bank USA', accountName: 'Apple Savings',
      accountMask: '', accountType: 'depository', accountSubtype: 'savings', health: 'healthy',
    };
    const balance = {
      ...linked, current: 10, available: 10, limit: null, isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null, fetchedAt: now, balanceStatus: 'fresh',
    } satisfies AccountBalanceRecord;
    expect(findLinkedDuplicate(manual, [linked], [balance])).toBe('linked-1');
    expect(findLinkedDuplicate(
      { ...manual, institutionName: 'Different Bank' },
      [{ ...linked, institutionName: 'Other Bank' }],
      [{ ...balance, institutionName: 'Other Bank' }]
    )).toBeNull();
  });

  it('never marks property as a duplicate of a linked financial account', () => {
    const home = buildManualAccount({
      institutionName: 'Property', accountName: 'Primary home', kind: 'real_estate', balance: 500000,
    }, id, now);
    const linked: ConnectedAccountRecord = {
      accountId: 'mortgage', institutionName: 'Property', accountName: 'Primary home',
      accountMask: '', accountType: 'loan', accountSubtype: 'mortgage', health: 'healthy',
    };
    const balance = {
      ...linked, current: 250000, available: null, limit: null, isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null, fetchedAt: now, balanceStatus: 'fresh',
    } satisfies AccountBalanceRecord;
    expect(findLinkedDuplicate(home, [linked], [balance])).toBeNull();
  });
});
