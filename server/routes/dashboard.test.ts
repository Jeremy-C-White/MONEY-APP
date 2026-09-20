import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggregateSummary } from '../lib/aggregations';
import { createDashboardRouter } from './dashboard';

describe('dashboard domain router', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  async function request(path: string) {
    const loadTransactions = vi.fn().mockResolvedValue([]);
    const app = express();
    app.use(createDashboardRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      loadTransactions,
      loadRecurringPlanning: vi.fn(),
      loadFinancialAccountContext: vi.fn(),
      currentDate: () => new Date('2026-09-20T12:00:00.000Z'),
      financeTimeZone: 'America/New_York',
    }));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { response, loadTransactions };
  }

  it('keeps the existing summary response shape', async () => {
    const { response, loadTransactions } = await request('/api/dashboard/summary');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(aggregateSummary([], 'America/New_York'));
    expect(loadTransactions).toHaveBeenCalledWith('owner');
  });

  it('rejects unsupported shared periods before loading financial data', async () => {
    for (const path of [
      '/api/dashboard/spending-breakdown?period=all_time',
      '/api/dashboard/trends?range=6m',
      '/api/dashboard/overview?range=ytd',
    ]) {
      const { response, loadTransactions } = await request(path);
      expect(response.status).toBe(400);
      expect(loadTransactions).not.toHaveBeenCalled();
    }
  });
});
