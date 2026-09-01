import { describe, expect, it } from 'vitest';
import { buildConnectedAccounts, ConnectedItemMetadata } from './connected-accounts';

function item(overrides: Partial<ConnectedItemMetadata> = {}): ConnectedItemMetadata {
  return {
    institutionName: 'Example Bank',
    health: 'healthy',
    accounts: [
      {
        id: 'account-1',
        name: 'Checking',
        mask: '1234',
        type: 'depository',
        subtype: 'checking'
      }
    ],
    ...overrides
  };
}

describe('buildConnectedAccounts', () => {
  it('builds one account', () => {
    expect(buildConnectedAccounts([item()])).toEqual([
      {
        accountId: 'account-1',
        institutionName: 'Example Bank',
        accountName: 'Checking',
        accountMask: '1234',
        accountType: 'depository',
        accountSubtype: 'checking',
        health: 'healthy'
      }
    ]);
  });

  it('builds multiple accounts across items', () => {
    const result = buildConnectedAccounts([
      item({
        accounts: [
          { id: 'account-1', name: 'Checking' },
          { id: 'account-2', name: 'Savings' }
        ]
      }),
      item({
        institutionName: 'Second Bank',
        accounts: [{ id: 'account-3', name: 'Credit Card' }]
      })
    ]);

    expect(result.map(account => account.accountId)).toEqual([
      'account-1',
      'account-2',
      'account-3'
    ]);
  });

  it('skips items with empty or missing accounts', () => {
    expect(buildConnectedAccounts([
      item({ accounts: [] }),
      item({ accounts: null }),
      item({ accounts: undefined })
    ])).toEqual([]);
  });

  it('preserves disconnected health', () => {
    expect(buildConnectedAccounts([item({ health: 'disconnected' })])[0].health)
      .toBe('disconnected');
  });

  it('preserves pending_disconnect health', () => {
    expect(buildConnectedAccounts([item({ health: 'pending_disconnect' })])[0].health)
      .toBe('pending_disconnect');
  });

  it('skips an account missing its ID', () => {
    expect(buildConnectedAccounts([item({ accounts: [{ name: 'Checking' }] })])).toEqual([]);
  });

  it('skips an account missing its name', () => {
    expect(buildConnectedAccounts([item({ accounts: [{ id: 'account-1' }] })])).toEqual([]);
  });

  it('skips an item missing its institution', () => {
    expect(buildConnectedAccounts([item({ institutionName: undefined })])).toEqual([]);
  });

  it('does not include sensitive item or account fields', () => {
    const result = buildConnectedAccounts([
      item({
        access_token: 'sensitive-token',
        userId: 'user-1',
        accounts: [{
          id: 'account-1',
          name: 'Checking',
          mask: '1234',
          type: 'depository',
          subtype: 'checking',
          balances: { current: 500 },
          routingNumber: '000000000'
        }]
      })
    ]);

    expect(result[0]).toEqual({
      accountId: 'account-1',
      institutionName: 'Example Bank',
      accountName: 'Checking',
      accountMask: '1234',
      accountType: 'depository',
      accountSubtype: 'checking',
      health: 'healthy'
    });
    expect(result[0]).not.toHaveProperty('access_token');
    expect(result[0]).not.toHaveProperty('balances');
    expect(result[0]).not.toHaveProperty('routingNumber');
  });

  it('preserves an unexpected health value', () => {
    expect(buildConnectedAccounts([item({ health: 'future_health_state' })])[0].health)
      .toBe('future_health_state');
  });
});
