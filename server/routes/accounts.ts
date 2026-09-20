import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { buildAccountHealthMap } from '../lib/aggregations';
import {
  AccountRoleRequestError,
  buildAccountRoleDocumentId,
  parseAccountRoleInput,
} from '../lib/account-roles';
import {
  buildManualAccount,
  ManualAccountRequestError,
  parseManualBalanceInput,
  parseStoredManualAccount,
  type StoredManualAccount,
} from '../lib/manual-accounts';
import type { EnrichedTransaction } from '../lib/transaction-enrichment';
import type { FinancialAccountContext } from './dashboard';
import { authenticatedUserId, type RouteInfrastructure } from './types';

export type BalanceCaptureResult = {
  date: string;
  eligibleItemCount: number;
  refreshedItemCount: number;
  manualAccountCount: number;
  errors: string[];
  hasSnapshotData: boolean;
};

export type ManualAccountSnapshotInput = {
  uid: string;
  account: StoredManualAccount;
  balance: number;
  recordedAt: string;
  isNew: boolean;
};

type AccountsRouterDependencies = Pick<RouteInfrastructure, 'requireAuth' | 'db'> & {
  loadFinancialAccountContext: (uid: string) => Promise<FinancialAccountContext>;
  captureDailyBalanceSnapshot: (uid: string) => Promise<BalanceCaptureResult>;
  writeManualAccountSnapshot: (input: ManualAccountSnapshotInput) => Promise<void>;
  loadTransactions: (uid: string) => Promise<EnrichedTransaction[]>;
  invalidateDashboard: (uid: string) => void;
  currentDate: () => Date;
  randomUuid: () => string;
};

export function createAccountsRouter(dependencies: AccountsRouterDependencies): express.Router {
  const router = express.Router();
  const {
    requireAuth,
    db,
    loadFinancialAccountContext,
    captureDailyBalanceSnapshot,
    writeManualAccountSnapshot,
    loadTransactions,
    invalidateDashboard,
    currentDate,
    randomUuid,
  } = dependencies;

  // Accounts-page inventory. Linked Plaid accounts and owner-entered manual assets live here.
  router.get('/api/connected-accounts', requireAuth, async (req, res) => {
    try {
      const context = await loadFinancialAccountContext(authenticatedUserId(req));
      res.json({
        accounts: context.accounts,
        summary: context.summary,
        financialPosition: context.financialPosition,
      });
    } catch (error: any) {
      console.error('Connected Accounts Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/account-balances/refresh', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const result = await captureDailyBalanceSnapshot(uid);
      if (!result.hasSnapshotData) {
        return res.status(result.errors.length > 0 ? 502 : 400).json({
          error: result.errors.length > 0
            ? 'No account balances could be refreshed.'
            : 'No eligible accounts are available for a net-worth snapshot.',
          ...result,
        });
      }
      invalidateDashboard(uid);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Balance Snapshot Capture Error:', error);
      res.status(500).json({ error: error.message || 'Unable to capture account balances.' });
    }
  });

  router.post('/api/manual-accounts', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const recordedAt = currentDate().toISOString();
      const accountId = `manual_${randomUuid()}`;
      const account = buildManualAccount(req.body, accountId, recordedAt);
      await writeManualAccountSnapshot({
        uid,
        account,
        balance: account.currentBalance,
        recordedAt,
        isNew: true,
      });
      invalidateDashboard(uid);
      res.status(201).json({ accountId, account });
    } catch (error: any) {
      if (error instanceof ManualAccountRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Manual Account Create Error:', error);
      res.status(500).json({ error: 'Unable to create the manual account.' });
    }
  });

  router.put('/api/manual-accounts/:accountId/balance', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const accountId = String(req.params.accountId || '').trim();
      if (!/^manual_[a-f0-9-]{36}$/.test(accountId)) {
        return res.status(400).json({ error: 'A valid manual account is required.' });
      }
      const accountDocument = await db.collection('users').doc(uid)
        .collection('manual_accounts').doc(accountId).get();
      const account = parseStoredManualAccount(accountDocument.data());
      if (!account) return res.status(404).json({ error: 'Manual account not found.' });

      const balance = parseManualBalanceInput(req.body);
      const recordedAt = currentDate().toISOString();
      await writeManualAccountSnapshot({ uid, account, balance, recordedAt, isNew: false });
      invalidateDashboard(uid);
      res.json({ accountId, balance, updatedAt: recordedAt });
    } catch (error: any) {
      if (error instanceof ManualAccountRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Manual Account Balance Error:', error);
      res.status(500).json({ error: 'Unable to update the manual balance.' });
    }
  });

  router.put('/api/account-roles/:accountId', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const accountId = String(req.params.accountId || '').trim();
      if (!accountId || accountId.length > 200) {
        return res.status(400).json({ error: 'A valid account is required.' });
      }
      const role = parseAccountRoleInput(req.body?.role);
      const [plaidItems, manualAccount] = await Promise.all([
        db.collection('plaid_items').where('userId', '==', uid).get(),
        db.collection('users').doc(uid).collection('manual_accounts').doc(accountId).get(),
      ]);
      const accountExists = plaidItems.docs.some(document => {
        const accounts = document.data().accounts;
        return Array.isArray(accounts) && accounts.some(account => account?.id === accountId);
      }) || manualAccount.exists;
      if (!accountExists) return res.status(404).json({ error: 'Account not found.' });

      const roleReference = db.collection('users').doc(uid)
        .collection('account_roles').doc(buildAccountRoleDocumentId(accountId));
      if (role === null) await roleReference.delete();
      else await roleReference.set({ accountId, role, updatedAt: FieldValue.serverTimestamp() });
      invalidateDashboard(uid);
      res.json({ accountId, role });
    } catch (error: any) {
      if (error instanceof AccountRoleRequestError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Account Role Error:', error);
      res.status(500).json({ error: 'Unable to save the account role.' });
    }
  });

  // Ledger account inventory for Transactions filters; intentionally separate from connected accounts.
  router.get('/api/accounts', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const [txs, plaidItems] = await Promise.all([
        loadTransactions(uid),
        db.collection('plaid_items').where('userId', '==', uid).get(),
      ]);
      const itemHealthMap = buildAccountHealthMap(plaidItems.docs.map(document => document.data()));
      const accounts = new Map<string, Record<string, unknown>>();
      for (const transaction of txs) {
        if (!accounts.has(transaction.accountId)) {
          accounts.set(transaction.accountId, {
            accountId: transaction.accountId,
            institutionName: transaction.institutionName,
            accountName: transaction.accountName,
            accountMask: transaction.accountMask,
            accountType: transaction.accountType,
            accountSubtype: transaction.accountSubtype,
            health: itemHealthMap.get(transaction.accountId) || 'unknown',
          });
        }
      }
      res.json([...accounts.values()]);
    } catch (error: any) {
      console.error('Ledger Accounts Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
