import { describe, expect, it } from 'vitest';
import { buildAccountsPreflightReport } from './accounts-preflight';

describe('buildAccountsPreflightReport', () => {
  it('reconciles persisted and ledger account IDs', () => {
    const report = buildAccountsPreflightReport([
      {
        institutionName: 'Example Bank',
        health: 'healthy',
        accounts: [{ id: 'shared' }, { id: 'persisted-only' }]
      }
    ], [
      { accountId: 'shared' },
      { accountId: 'ledger-only' },
      { accountId: 'shared' }
    ]);

    expect(report).toMatchObject({
      uniquePersistedAccountIds: 2,
      uniqueLedgerAccountIds: 2,
      idsInBoth: 1,
      persistedOnlyIds: 1,
      ledgerOnlyIds: 1
    });
  });

  it('includes disconnected account IDs in reconciliation', () => {
    const report = buildAccountsPreflightReport([
      {
        institutionName: 'Former Bank',
        health: 'disconnected',
        accounts: [{ id: 'historical-account' }]
      }
    ], [{ accountId: 'historical-account' }]);

    expect(report).toMatchObject({
      activeItemCount: 0,
      disconnectedItemCount: 1,
      uniquePersistedAccountIds: 1,
      idsInBoth: 1,
      ledgerOnlyIds: 0
    });
  });

  it('reports active items with missing accounts', () => {
    const report = buildAccountsPreflightReport([
      { institutionName: 'Empty Bank', health: 'healthy', accounts: [] },
      { health: 'login_required' }
    ], []);

    expect(report.activeItemsWithoutAccounts).toBe(2);
    expect(report.itemsWithMissingAccounts).toEqual([
      { institutionName: 'Empty Bank', health: 'healthy' },
      { institutionName: 'Unknown', health: 'login_required' }
    ]);
  });

  it('preserves unexpected health values and accepts legacy account_id metadata', () => {
    const report = buildAccountsPreflightReport([
      {
        institutionName: 'Future Bank',
        health: 'future_health_state',
        accounts: [{ id: ' ', account_id: 'legacy-id' }]
      }
    ], []);

    expect(report.healthBreakdown).toEqual({ future_health_state: 1 });
    expect(report.uniquePersistedAccountIds).toBe(1);
    expect(report.persistedOnlyIds).toBe(1);
  });
});
