import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSEHOLD_PLAN } from '../lib/household-plan';
import { createPlanningRouter } from './planning';

describe('planning domain router', () => {
  const servers: Array<ReturnType<express.Express['listen']>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })));
  });

  it('returns the stored household plan through the existing response envelope', async () => {
    const loadHouseholdPlan = vi.fn().mockResolvedValue(DEFAULT_HOUSEHOLD_PLAN);
    const app = express();
    app.use(createPlanningRouter({
      requireAuth: (req, _res, next) => {
        (req as express.Request & { user: { uid: string } }).user = { uid: 'owner' };
        next();
      },
      db: {} as Firestore,
      loadHouseholdPlan,
      recurringDecisions: {
        loadDetected: vi.fn(),
        setDecision: vi.fn(),
        deleteDecision: vi.fn(),
        updatedAt: vi.fn(),
      },
    }));
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/household-plan`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ householdPlan: DEFAULT_HOUSEHOLD_PLAN });
    expect(loadHouseholdPlan).toHaveBeenCalledWith('owner');
  });
});
