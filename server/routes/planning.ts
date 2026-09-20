import express from 'express';
import {
  HouseholdPlanRequestError,
  parseHouseholdPlanInput,
  type HouseholdPlan,
} from '../lib/household-plan';
import {
  RecurringObligationRequestError,
  removeRecurringDecision,
  saveRecurringDecision,
  type RecurringDecisionServiceDependencies,
} from '../lib/recurring-obligation-decisions';
import { authenticatedUserId, type RouteInfrastructure } from './types';

type PlanningRouterDependencies = Pick<RouteInfrastructure, 'requireAuth' | 'db'> & {
  loadHouseholdPlan: (uid: string) => Promise<HouseholdPlan>;
  recurringDecisions: RecurringDecisionServiceDependencies;
};

export function createPlanningRouter(dependencies: PlanningRouterDependencies): express.Router {
  const router = express.Router();
  const { requireAuth, db, loadHouseholdPlan, recurringDecisions } = dependencies;

  router.put('/api/recurring-obligations/:obligationId', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const obligationId = req.params.obligationId;
      const decision = await saveRecurringDecision(
        recurringDecisions,
        uid,
        obligationId,
        req.body
      );
      res.json({ obligationId, decision });
    } catch (error: any) {
      if (error instanceof RecurringObligationRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Recurring Obligation Write Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api/recurring-obligations/:obligationId', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const obligationId = req.params.obligationId;
      await removeRecurringDecision(recurringDecisions, uid, obligationId);
      res.json({ success: true, obligationId });
    } catch (error: any) {
      if (error instanceof RecurringObligationRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Recurring Obligation Delete Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/household-plan', requireAuth, async (req, res) => {
    try {
      res.json({ householdPlan: await loadHouseholdPlan(authenticatedUserId(req)) });
    } catch (error: any) {
      console.error('Household Plan Read Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/api/household-plan', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const householdPlan = parseHouseholdPlanInput(req.body, await loadHouseholdPlan(uid));
      await db.collection('users').doc(uid).set({ householdPlan }, { merge: true });
      res.json({ householdPlan });
    } catch (error: any) {
      if (error instanceof HouseholdPlanRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Household Plan Write Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
