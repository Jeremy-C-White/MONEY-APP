import type { AddressInfo } from 'node:net';
import express from 'express';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedTransaction } from '../lib/transaction-enrichment';
import { createTransactionRouter } from './transactions';

function transaction(overrides: Partial<EnrichedTransaction> = {}): EnrichedTransaction {
  return {
    transactionId: 'tx-1', accountId: 'account-1', institutionName: 'Bank', accountName: 'Checking',
    accountMask: '1234', accountType: 'depository', accountSubtype: 'checking', rawDate: '',
    normalizedDate: '2026-09-20', name: 'Merchant', normalizedMerchant: 'Merchant', plaidAmount: 20,
    cashFlowAmount: -20, categoryPrimary: 'GENERAL_MERCHANDISE',
    categoryDetailed: 'GENERAL_MERCHANDISE_OTHER', normalizedCategory: 'GENERAL_MERCHANDISE',
    pending: false, pendingTransactionId: '', status: 'posted', removed: false, classification: 'spending',
    countsTowardSpending: true, countsTowardIncome: false, spendingAdjustment: 20, incomeAdjustment: 0,
    isOverridden: false, overrideNote: null, overrideOffsetCategory: null, categoryConfidence: 'HIGH',
    householdLabel: null, merchantKey: 'merchant', merchantLabelRuleId: null,
    ...overrides,
  };
}

describe('transaction domain router', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  async function request(
    transactions: EnrichedTransaction[],
    path: string,
    db: Firestore = {} as Firestore
  ): Promise<Response> {
    const app = express();
    app.use(express.json());
    app.use(createTransactionRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      db,
      loadTransactions: vi.fn().mockResolvedValue(transactions),
      transactionOverrides: {
        loadTransactions: vi.fn().mockResolvedValue(transactions),
        persistOverride: vi.fn(), deleteOverride: vi.fn(), invalidateCache: vi.fn(), reviewedAt: vi.fn(),
      },
      classificationRules: { deleteRule: vi.fn(), invalidateCache: vi.fn() },
      invalidateDashboard: vi.fn(),
      now: () => Timestamp.fromMillis(0),
    }));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}${path}`);
  }

  it('keeps enrichment filters and pagination on the transactions endpoint', async () => {
    const response = await request([
      transaction({ transactionId: 'low-unlabeled', categoryConfidence: 'LOW' }),
      transaction({ transactionId: 'low-labeled', categoryConfidence: 'LOW', householdLabel: 'Kids' }),
      transaction({ transactionId: 'high-unlabeled', categoryConfidence: 'HIGH' }),
    ], '/api/transactions?categoryConfidence=LOW&unlabeled=true&page=1&limit=10');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      transactions: [{ transactionId: 'low-unlabeled' }],
    });
  });

  it('keeps merchant-label parsing and sorting on the labels endpoint', async () => {
    const documents = [
      { id: 'two', data: () => ({ merchantKey: 'z merchant', label: 'Kids', createdFromTransactionId: 'tx-2' }) },
      { id: 'one', data: () => ({ merchantKey: 'a merchant', label: 'Bills', createdFromTransactionId: 'tx-1' }) },
      { id: 'bad', data: () => ({ label: '' }) },
    ];
    const db = {
      collection: () => ({
        doc: () => ({ collection: () => ({ get: vi.fn().mockResolvedValue({ docs: documents }) }) }),
      }),
    } as unknown as Firestore;
    const response = await request([], '/api/merchant-labels', db);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      labels: [
        { ruleId: 'one', merchantKey: 'a merchant', label: 'Bills' },
        { ruleId: 'two', merchantKey: 'z merchant', label: 'Kids' },
      ],
    });
  });
});
