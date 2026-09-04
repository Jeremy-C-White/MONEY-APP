import { describe, expect, it } from 'vitest';
import {
  buildAccountBalanceSummary,
  buildStoredBalanceSnapshot,
  type BalanceItemMetadata,
} from './account-balances';

const NOW = '2026-09-03T12:00:00.000Z';

function item(overrides: Partial<BalanceItemMetadata> = {}): BalanceItemMetadata {
  return {
    itemId: 'item-1',
    institutionName: 'Example Bank',
    health: 'healthy',
    accounts: [{ id: 'checking-1', name: 'Checking', type: 'depository' }],
    balanceSnapshot: buildStoredBalanceSnapshot({
      institutionName: 'Example Bank',
      fetchedAt: '2026-09-03T10:00:00.000Z',
      accounts: [{
        account_id: 'checking-1',
        name: 'Checking',
        mask: '1234',
        type: 'depository',
        subtype: 'checking',
        balances: {
          current: 1500.25,
          available: 1425.5,
          limit: null,
          iso_currency_code: 'USD',
        },
      }],
    }),
    ...overrides,
  };
}

describe('buildStoredBalanceSnapshot', () => {
  it('keeps only display-safe account and balance fields', () => {
    const snapshot = buildStoredBalanceSnapshot({
      institutionName: 'Example Bank',
      fetchedAt: NOW,
      accounts: [{
        account_id: 'account-1',
        name: 'Checking',
        mask: '1234',
        type: 'depository',
        subtype: 'checking',
        balances: { current: 10, available: 8, limit: null, iso_currency_code: 'USD' },
        routing_number: 'secret',
      }],
    });

    expect(snapshot).toEqual({
      institutionName: 'Example Bank',
      fetchedAt: NOW,
      source: 'plaid_accounts_get',
      accounts: [{
        accountId: 'account-1',
        accountName: 'Checking',
        accountMask: '1234',
        accountType: 'depository',
        accountSubtype: 'checking',
        current: 10,
        available: 8,
        limit: null,
        isoCurrencyCode: 'USD',
        unofficialCurrencyCode: null,
      }],
    });
    expect(snapshot?.accounts[0]).not.toHaveProperty('routing_number');
  });

  it('preserves zero and negative balances and skips unusable accounts', () => {
    const snapshot = buildStoredBalanceSnapshot({
      institutionName: 'Example Bank',
      fetchedAt: NOW,
      accounts: [
        { id: 'credit-1', name: 'Card', balances: { current: -12, available: 0 } },
        { id: '', name: 'Missing ID', balances: { current: 99 } },
        { id: 'missing-name', name: '', balances: { current: 99 } },
      ],
    });

    expect(snapshot?.accounts).toHaveLength(1);
    expect(snapshot?.accounts[0].current).toBe(-12);
    expect(snapshot?.accounts[0].available).toBe(0);
  });

  it('rejects invalid item metadata', () => {
    expect(buildStoredBalanceSnapshot({ institutionName: '', fetchedAt: NOW, accounts: [] })).toBeNull();
    expect(buildStoredBalanceSnapshot({ institutionName: 'Bank', fetchedAt: 'bad', accounts: [] })).toBeNull();
  });
});

describe('buildAccountBalanceSummary', () => {
  it('computes cash, debt, investments, and position with Plaid sign semantics', () => {
    const result = buildAccountBalanceSummary([
      item(),
      item({
        itemId: 'item-2',
        institutionName: 'Card Bank',
        accounts: [
          { id: 'card-1', name: 'Card', type: 'credit' },
          { id: 'card-credit', name: 'Card Credit', type: 'credit' },
          { id: 'loan-1', name: 'Loan', type: 'loan' },
          { id: 'investment-1', name: 'Brokerage', type: 'investment' },
        ],
        balanceSnapshot: buildStoredBalanceSnapshot({
          institutionName: 'Card Bank',
          fetchedAt: '2026-09-03T11:00:00.000Z',
          accounts: [
            { id: 'card-1', name: 'Card', type: 'credit', balances: { current: 200, available: 800, limit: 1000, iso_currency_code: 'USD' } },
            { id: 'card-credit', name: 'Card Credit', type: 'credit', balances: { current: -25, available: 1025, limit: 1000, iso_currency_code: 'USD' } },
            { id: 'loan-1', name: 'Loan', type: 'loan', balances: { current: 5000, available: null, limit: null, iso_currency_code: 'USD' } },
            { id: 'investment-1', name: 'Brokerage', type: 'investment', balances: { current: 3000, available: 100, limit: null, iso_currency_code: 'USD' } },
          ],
        }),
      }),
    ], NOW);

    expect(result.status).toBe('complete');
    expect(result.cashCurrent).toBe(1500.25);
    expect(result.cashAvailable).toBe(1425.5);
    expect(result.creditBalance).toBe(175);
    expect(result.creditOwed).toBe(200);
    expect(result.creditCredits).toBe(25);
    expect(result.loanBalance).toBe(5000);
    expect(result.investmentValue).toBe(3000);
    expect(result.connectedPosition).toBe(-674.75);
  });

  it('marks missing and stale items without turning unknown balances into zero', () => {
    const result = buildAccountBalanceSummary([
      item({ balanceSnapshot: null }),
      item({
        itemId: 'item-2',
        institutionName: 'Old Bank',
        balanceSnapshot: buildStoredBalanceSnapshot({
          institutionName: 'Old Bank',
          fetchedAt: '2026-08-30T10:00:00.000Z',
          accounts: [{ id: 'savings', name: 'Savings', type: 'depository', balances: { current: null, available: 20, iso_currency_code: 'USD' } }],
        }),
      }),
    ], NOW);

    expect(result.status).toBe('unavailable');
    expect(result.cashCurrent).toBeNull();
    expect(result.cashAvailable).toBe(20);
    expect(result.connectedPosition).toBeNull();
    expect(result.issues.map(issue => issue.reason)).toEqual(['missing', 'stale']);
  });

  it('does not mix currencies or count disconnected items', () => {
    const result = buildAccountBalanceSummary([
      item(),
      item({
        itemId: 'item-eur',
        institutionName: 'Euro Bank',
        balanceSnapshot: buildStoredBalanceSnapshot({
          institutionName: 'Euro Bank',
          fetchedAt: NOW,
          accounts: [{ id: 'eur', name: 'Euro', type: 'depository', balances: { current: 100, available: 100, iso_currency_code: 'EUR' } }],
        }),
      }),
      item({ itemId: 'old', health: 'disconnected' }),
    ], NOW);

    expect(result.currency).toBeNull();
    expect(result.cashCurrent).toBeNull();
    expect(result.connectedPosition).toBeNull();
    expect(result.accounts.some(account => account.accountId === 'checking-1' && account.health === 'disconnected')).toBe(false);
    expect(result.currencyIssueCount).toBe(2);
  });

  it('surfaces connection health as a partial result even with fresh balances', () => {
    const result = buildAccountBalanceSummary([
      item({ health: 'login_required' }),
    ], NOW);

    expect(result.status).toBe('partial');
    expect(result.cashCurrent).toBe(1500.25);
    expect(result.issues).toEqual([{ itemId: 'item-1', institutionName: 'Example Bank', reason: 'connection' }]);
  });

  it('marks an inventory account missing from the snapshot as incomplete', () => {
    const result = buildAccountBalanceSummary([
      item({
        accounts: [
          { id: 'checking-1', name: 'Checking', type: 'depository' },
          { id: 'savings-1', name: 'Savings', type: 'depository' },
        ],
      }),
    ], NOW);

    expect(result.status).toBe('partial');
    expect(result.missingCurrentBalanceCount).toBe(1);
    expect(result.accounts.find(account => account.accountId === 'savings-1')).toMatchObject({
      current: null,
      balanceStatus: 'missing',
    });
  });

  it('rejects an invalid summary time', () => {
    expect(() => buildAccountBalanceSummary([item()], 'invalid')).toThrow(
      'A valid balance summary time is required.'
    );
  });
});
