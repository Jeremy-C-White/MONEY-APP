import type { AddressInfo } from 'node:net';
import express from 'express';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { WalmartInsights } from '../lib/walmart-insights';
import { createWalmartRouter } from './walmart';

type LoadInsights = Parameters<typeof createWalmartRouter>[0]['loadInsights'];

describe('Walmart domain router', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  async function request(input: {
    path: string;
    method?: string;
    body?: unknown;
    userData?: Record<string, unknown>;
    loadInsights?: Mock<LoadInsights>;
  }): Promise<{ response: Response; loadInsights: Mock<LoadInsights> }> {
    const loadInsights = input.loadInsights || vi.fn<LoadInsights>();
    const db = {
      collection: () => ({
        doc: () => ({
          get: vi.fn().mockResolvedValue({ data: () => input.userData || {} }),
          set: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    } as unknown as Firestore;
    const app = express();
    app.use(express.json());
    app.use(createWalmartRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      db,
      now: () => Timestamp.fromMillis(0),
      readWorkbook: vi.fn(),
      loadInsights,
      clearCache: vi.fn(),
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
    return { response, loadInsights };
  }

  it('returns the configured Walmart source using the existing response shape', async () => {
    const { response } = await request({
      path: '/api/walmart/source',
      userData: { walmartSpreadsheetId: 'sheet-123', walmartSpreadsheetTitle: 'Walmart history' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connected: true,
      spreadsheetId: 'sheet-123',
      spreadsheetTitle: 'Walmart history',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
    });
  });

  it('passes validated period and refresh controls to the insights loader', async () => {
    const loadInsights = vi.fn().mockResolvedValue({
      report: { period: 'last_30_days', summary: { totalSpend: 100 } } as unknown as WalmartInsights,
      sheetReadAt: '2026-09-20T12:00:00.000Z',
    });
    const { response } = await request({
      path: '/api/walmart/insights?period=last_30_days&refresh=true',
      userData: { walmartSpreadsheetId: 'sheet-123', walmartSpreadsheetTitle: 'Walmart history' },
      loadInsights,
    });

    expect(response.status).toBe(200);
    expect(loadInsights).toHaveBeenCalledWith('owner', 'sheet-123', 'last_30_days', true);
    expect(await response.json()).toMatchObject({
      period: 'last_30_days',
      source: { spreadsheetTitle: 'Walmart history', sheetReadAt: '2026-09-20T12:00:00.000Z' },
    });
  });

  it('rejects invalid source links and insight periods before external reads', async () => {
    const invalidSource = await request({
      path: '/api/walmart/source', method: 'PUT', body: { spreadsheetUrl: 'not-a-sheet' },
    });
    expect(invalidSource.response.status).toBe(400);
    expect(await invalidSource.response.json()).toMatchObject({ code: 'INVALID_WALMART_SPREADSHEET' });

    const invalidPeriod = await request({ path: '/api/walmart/insights?period=all_time' });
    expect(invalidPeriod.response.status).toBe(400);
    expect(invalidPeriod.loadInsights).not.toHaveBeenCalled();
  });
});
