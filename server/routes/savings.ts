import express from 'express';
import {
  SavingsDestinationRequestError,
  buildSavingsContributions,
  isSavingsDestinationId,
  parseSavingsDestinationName,
} from '../lib/savings-contributions';
import { getDateForDateInTimezone } from '../lib/time';
import type { EnrichedTransaction } from '../lib/transaction-enrichment';
import { authenticatedUserId, type RouteInfrastructure } from './types';

type SavingsRouterDependencies = RouteInfrastructure & {
  loadTransactions: (uid: string) => Promise<EnrichedTransaction[]>;
  loadDestinationNames: (uid: string) => Promise<Map<string, string>>;
  invalidateDashboard: (uid: string) => void;
  currentDate: () => Date;
  financeTimeZone: string;
};

export function createSavingsRouter(dependencies: SavingsRouterDependencies): express.Router {
  const router = express.Router();
  const {
    requireAuth,
    db,
    now,
    loadTransactions,
    loadDestinationNames,
    invalidateDashboard,
    currentDate,
    financeTimeZone,
  } = dependencies;

  router.get('/api/savings/contributions', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const [transactions, displayNames] = await Promise.all([
        loadTransactions(uid),
        loadDestinationNames(uid),
      ]);
      res.json(buildSavingsContributions({
        transactions,
        displayNames,
        asOfDate: getDateForDateInTimezone(currentDate(), financeTimeZone),
      }));
    } catch (error: any) {
      console.error('Savings Contributions Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/api/savings/destinations/:destinationId', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const destinationId = req.params.destinationId;
      if (!isSavingsDestinationId(destinationId)) {
        return res.status(400).json({ error: 'Invalid savings destination ID.' });
      }
      const displayName = parseSavingsDestinationName(req.body);
      const [transactions, displayNames] = await Promise.all([
        loadTransactions(uid),
        loadDestinationNames(uid),
      ]);
      const report = buildSavingsContributions({
        transactions,
        displayNames,
        asOfDate: getDateForDateInTimezone(currentDate(), financeTimeZone),
      });
      const destination = report.destinations.find(item => item.destinationId === destinationId);
      if (!destination) return res.status(404).json({ error: 'Savings destination not found.' });

      const destinationReference = db.collection('users').doc(uid)
        .collection('savings_destinations').doc(destinationId);
      const existing = await destinationReference.get();
      const updatedAt = now();
      await destinationReference.set({
        key: destination.key,
        displayName,
        createdAt: existing.data()?.createdAt || updatedAt,
        updatedAt,
      }, { merge: true });
      invalidateDashboard(uid);
      res.json({ destinationId, key: destination.key, displayName });
    } catch (error: any) {
      if (error instanceof SavingsDestinationRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Savings Destination Rename Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
