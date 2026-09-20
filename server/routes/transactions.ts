import express from 'express';
import { buildTransactionsPage } from '../lib/aggregations';
import {
  ClassificationRuleRequestError,
  parseStoredClassificationRule,
  removeClassificationRule,
  type ClassificationRuleServiceDependencies,
} from '../lib/classification-rules';
import {
  buildMerchantLabelRule,
  filterTransactionEnrichment,
  MerchantLabelRequestError,
  normalizeMerchantLabel,
  parseMerchantLabelRule,
  type EnrichedTransaction,
} from '../lib/transaction-enrichment';
import {
  parseStoredTransactionOverride,
  removeTransactionOverride,
  saveTransactionOverride,
  TransactionOverrideRequestError,
  type TransactionOverrideServiceDependencies,
} from '../lib/transaction-overrides';

type TransactionRouterDependencies = {
  requireAuth: express.RequestHandler;
  db: any;
  loadTransactions: (uid: string) => Promise<EnrichedTransaction[]>;
  transactionOverrides: TransactionOverrideServiceDependencies;
  classificationRules: ClassificationRuleServiceDependencies;
  invalidateDashboard: (uid: string) => void;
  now: () => unknown;
};

function userId(req: express.Request): string {
  return (req as express.Request & { user: { uid: string } }).user.uid;
}

export function createTransactionRouter(dependencies: TransactionRouterDependencies): express.Router {
  const router = express.Router();
  const {
    requireAuth,
    db,
    loadTransactions,
    transactionOverrides,
    classificationRules,
    invalidateDashboard,
    now,
  } = dependencies;

  router.get('/api/transactions/overrides', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const snapshot = await db.collection('users').doc(uid)
        .collection('transaction_overrides')
        .orderBy('reviewedAt', 'desc')
        .get();
      const overrides = snapshot.docs.flatMap((document: any) => {
        const data = document.data();
        const parsed = parseStoredTransactionOverride(data);
        if (!parsed) return [];
        return [{
          transactionId: document.id,
          ...parsed,
          reviewedAt: data.reviewedAt,
          reviewedBy: data.reviewedBy,
        }];
      });
      res.json({ overrides });
    } catch (error: any) {
      console.error('Transaction Overrides List Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/classification-rules', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const snapshot = await db.collection('users').doc(uid)
        .collection('classification_rules')
        .get();
      const rules = snapshot.docs.flatMap((document: any) => {
        const rule = parseStoredClassificationRule(document.id, document.data());
        return rule ? [rule] : [];
      });
      rules.sort((left: any, right: any) => left.merchantKey.localeCompare(right.merchantKey));
      res.json({ rules });
    } catch (error: any) {
      console.error('Classification Rules List Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api/classification-rules/:ruleId', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const ruleId = req.params.ruleId;
      await removeClassificationRule(classificationRules, uid, ruleId);
      res.json({ success: true, ruleId });
    } catch (error: any) {
      if (error instanceof ClassificationRuleRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Classification Rule Delete Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/merchant-labels', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const snapshot = await db.collection('users').doc(uid).collection('merchant_labels').get();
      const labels = snapshot.docs.flatMap((document: any) => {
        const rule = parseMerchantLabelRule(document.id, document.data());
        return rule ? [rule] : [];
      }).sort((left: any, right: any) => (
        left.label.localeCompare(right.label) || left.merchantKey.localeCompare(right.merchantKey)
      ));
      res.json({ labels });
    } catch (error: any) {
      console.error('Merchant Labels List Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/api/merchant-labels', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const currentLabel = typeof req.body?.currentLabel === 'string' ? req.body.currentLabel.trim() : '';
      if (!currentLabel) throw new MerchantLabelRequestError('Choose a household label to rename.', 400);
      const label = normalizeMerchantLabel(req.body?.label);
      const collection = db.collection('users').doc(uid).collection('merchant_labels');
      const snapshot = await collection.get();
      const matches = snapshot.docs.filter((document: any) => {
        const rule = parseMerchantLabelRule(document.id, document.data());
        return rule?.label.toLowerCase() === currentLabel.toLowerCase();
      });
      if (!matches.length) throw new MerchantLabelRequestError('Household label not found.', 404);
      const updatedAt = now();
      const batch = db.batch();
      for (const document of matches) batch.update(document.ref, { label, updatedAt });
      await batch.commit();
      invalidateDashboard(uid);
      res.json({ currentLabel, label, merchantCount: matches.length });
    } catch (error: any) {
      if (error instanceof MerchantLabelRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Merchant Labels Rename Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api/merchant-labels/:ruleId', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const ruleId = req.params.ruleId;
      const reference = db.collection('users').doc(uid).collection('merchant_labels').doc(ruleId);
      const document = await reference.get();
      if (!document.exists || !parseMerchantLabelRule(ruleId, document.data())) {
        throw new MerchantLabelRequestError('Household label rule not found.', 404);
      }
      await reference.delete();
      invalidateDashboard(uid);
      res.json({ success: true, ruleId });
    } catch (error: any) {
      if (error instanceof MerchantLabelRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Merchant Label Delete Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/api/transactions/:transactionId/override', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const transactionId = req.params.transactionId;
      const override = await saveTransactionOverride(
        transactionOverrides,
        uid,
        transactionId,
        req.body
      );
      res.json({ transactionId, override });
    } catch (error: any) {
      if (error instanceof TransactionOverrideRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Transaction Override Write Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api/transactions/:transactionId/override', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const transactionId = req.params.transactionId;
      await removeTransactionOverride(transactionOverrides, uid, transactionId);
      res.json({ success: true, transactionId });
    } catch (error: any) {
      if (error instanceof TransactionOverrideRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Transaction Override Delete Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/api/transactions/:transactionId/merchant-label', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const transactionId = req.params.transactionId;
      const transaction = (await loadTransactions(uid)).find(candidate => (
        candidate.transactionId === transactionId && !candidate.removed
      ));
      if (!transaction) throw new MerchantLabelRequestError('Transaction not found.', 404);

      const updatedAt = now();
      const rule = buildMerchantLabelRule(transaction, req.body?.label, updatedAt);
      const reference = db.collection('users').doc(uid).collection('merchant_labels').doc(rule.ruleId);
      const existing = await reference.get();
      await reference.set({
        merchantKey: rule.merchantKey,
        label: rule.label,
        createdFromTransactionId: existing.exists
          ? existing.data()?.createdFromTransactionId || rule.createdFromTransactionId
          : rule.createdFromTransactionId,
        createdAt: existing.exists ? existing.data()?.createdAt || updatedAt : updatedAt,
        updatedAt,
      });
      invalidateDashboard(uid);
      res.json({
        transactionId,
        rule: { ...rule, createdAt: existing.data()?.createdAt || updatedAt },
      });
    } catch (error: any) {
      if (error instanceof MerchantLabelRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Merchant Label Write Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/api/transactions/:transactionId/merchant-label', requireAuth, async (req, res) => {
    try {
      const uid = userId(req);
      const transactionId = req.params.transactionId;
      const transaction = (await loadTransactions(uid)).find(candidate => (
        candidate.transactionId === transactionId && !candidate.removed
      ));
      if (!transaction) throw new MerchantLabelRequestError('Transaction not found.', 404);
      if (!transaction.merchantLabelRuleId) {
        throw new MerchantLabelRequestError('This merchant does not have a household label.', 404);
      }
      await db.collection('users').doc(uid)
        .collection('merchant_labels')
        .doc(transaction.merchantLabelRuleId)
        .delete();
      invalidateDashboard(uid);
      res.json({ success: true, transactionId });
    } catch (error: any) {
      if (error instanceof MerchantLabelRequestError) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('Merchant Label Delete Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/transactions', requireAuth, async (req, res) => {
    try {
      const transactions = await loadTransactions(userId(req));
      const { categoryConfidence, unlabeled, householdLabel, ...transactionFilters } = req.query;
      const filtered = filterTransactionEnrichment(transactions, {
        categoryConfidence,
        unlabeled,
        householdLabel,
      });

      // In-memory sort/pagination is appropriate for the current cached ledger size.
      res.json(buildTransactionsPage(filtered, transactionFilters));
    } catch (error: any) {
      console.error('Transactions Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
