import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccountsRouter } from './accounts';

describe('accounts domain router', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  async function request(input: {
    path: string;
    method: string;
    body?: unknown;
    captureResult?: Record<string, unknown>;
  }) {
    const invalidateDashboard = vi.fn();
    const app = express();
    app.use(express.json());
    app.use(createAccountsRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      db: {} as Firestore,
      loadFinancialAccountContext: vi.fn(),
      captureDailyBalanceSnapshot: vi.fn().mockResolvedValue(input.captureResult),
      writeManualAccountSnapshot: vi.fn(),
      loadTransactions: vi.fn(),
      invalidateDashboard,
      currentDate: () => new Date('2026-09-20T12:00:00.000Z'),
      randomUuid: () => '00000000-0000-4000-8000-000000000000',
    }));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${input.path}`, {
      method: input.method,
      headers: input.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    return { response, invalidateDashboard };
  }

  it('rejects malformed manual account IDs before reading storage', async () => {
    const { response } = await request({
      path: '/api/manual-accounts/not-a-manual-account/balance',
      method: 'PUT',
      body: { balance: 100 },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A valid manual account is required.' });
  });

  it('keeps incomplete balance refreshes out of the dashboard cache', async () => {
    const { response, invalidateDashboard } = await request({
      path: '/api/account-balances/refresh',
      method: 'POST',
      captureResult: {
        date: '2026-09-20',
        eligibleItemCount: 0,
        refreshedItemCount: 0,
        manualAccountCount: 0,
        errors: [],
        hasSnapshotData: false,
      },
    });

    expect(response.status).toBe(400);
    expect(invalidateDashboard).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: 'No eligible accounts are available for a net-worth snapshot.',
      hasSnapshotData: false,
    });
  });
});
