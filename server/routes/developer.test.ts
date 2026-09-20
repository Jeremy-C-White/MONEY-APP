import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeveloperRouter, developerRoutesEnabled } from './developer';

describe('developer route isolation', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  it('only enables developer routes in an explicitly opted-in sandbox', () => {
    expect(developerRoutesEnabled({ PLAID_ENV: 'sandbox', ENABLE_SANDBOX_ACCEPTANCE: 'true' })).toBe(true);
    expect(developerRoutesEnabled({ PLAID_ENV: 'production', ENABLE_SANDBOX_ACCEPTANCE: 'true' })).toBe(false);
    expect(developerRoutesEnabled({ PLAID_ENV: 'sandbox' })).toBe(false);
  });

  it('keeps sandbox refresh validation inside the isolated router', async () => {
    const app = express();
    app.use(express.json());
    app.use(createDeveloperRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      db: {} as Firestore,
      loadTransactions: vi.fn(),
      loadRawRows: vi.fn(),
      normalizeItemHealth: vi.fn(),
      plaidClient: vi.fn(),
    }));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/dev/sandbox-refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'internalItemId is required.' });
  });
});
