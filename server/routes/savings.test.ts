import type { AddressInfo } from 'node:net';
import express from 'express';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSavingsRouter } from './savings';

describe('savings domain router', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  it('rejects invalid destination IDs before loading financial data', async () => {
    const loadTransactions = vi.fn();
    const app = express();
    app.use(express.json());
    app.use(createSavingsRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      db: {} as Firestore,
      now: () => Timestamp.fromMillis(0),
      loadTransactions,
      loadDestinationNames: vi.fn(),
      invalidateDashboard: vi.fn(),
      currentDate: () => new Date('2026-09-20T12:00:00.000Z'),
      financeTimeZone: 'America/New_York',
    }));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/savings/destinations/not-valid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Retirement' }),
    });

    expect(response.status).toBe(400);
    expect(loadTransactions).not.toHaveBeenCalled();
  });
});
