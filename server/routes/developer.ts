import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { buildAccountsPreflightReport } from '../lib/accounts-preflight';
import type { EnrichedTransaction } from '../lib/transaction-enrichment';
import { authenticatedUserId } from './types';

type PlaidRefreshClient = {
  transactionsRefresh(input: { access_token: string }): Promise<unknown>;
};

type DeveloperRouterDependencies = {
  requireAuth: express.RequestHandler;
  db: Firestore;
  loadTransactions: (
    uid: string,
    options?: { allowCredentialCleanup?: boolean }
  ) => Promise<EnrichedTransaction[]>;
  loadRawRows: (uid: string) => Promise<unknown[]>;
  normalizeItemHealth: (data: Record<string, unknown>) => string;
  plaidClient: () => PlaidRefreshClient;
};

export function developerRoutesEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.PLAID_ENV === 'sandbox' && env.ENABLE_SANDBOX_ACCEPTANCE === 'true';
}

export function createDeveloperRouter(dependencies: DeveloperRouterDependencies): express.Router {
  const router = express.Router();
  const { requireAuth, db, loadTransactions, loadRawRows, normalizeItemHealth, plaidClient } = dependencies;

  router.get('/api/dev/accounts-preflight', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const plaidItems = await db.collection('plaid_items').where('userId', '==', uid).get();
      const items = plaidItems.docs.map(document => {
        const data = document.data();
        return {
          institutionName: data.institution_name,
          health: normalizeItemHealth(data),
          accounts: data.accounts,
        };
      });
      const txs = await loadTransactions(uid, { allowCredentialCleanup: false });
      res.json(buildAccountsPreflightReport(items, txs));
    } catch (error: any) {
      console.error('Accounts Preflight Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dev/sandbox-acceptance', requireAuth, async (req, res) => {
    try {
      const rawRows = await loadRawRows(authenticatedUserId(req));
      const { generateAcceptanceReport } = await import('../lib/sandbox-acceptance');
      res.json(generateAcceptanceReport(rawRows));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/dev/sandbox-refresh', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const internalItemId = req.body?.internalItemId;
      if (!internalItemId) return res.status(400).json({ error: 'internalItemId is required.' });

      const itemSnapshot = await db.collection('plaid_items').doc(internalItemId).get();
      if (!itemSnapshot.exists) return res.status(404).json({ error: 'Connected item not found.' });

      const item = itemSnapshot.data()!;
      if (item.userId !== uid) return res.status(403).json({ error: 'Unauthorized access to item.' });
      if (!item.access_token) return res.status(400).json({ error: 'No access token found.' });
      if (['pending_disconnect', 'permission_revoked', 'login_required'].includes(item.health || '')) {
        return res.status(400).json({ error: 'Item is disconnected or requires repair.' });
      }

      await plaidClient().transactionsRefresh({ access_token: item.access_token });
      res.json({ success: true, message: 'Sandbox refresh triggered. Webhook will arrive shortly.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
