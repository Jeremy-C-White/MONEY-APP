import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  buildWalmartInsights,
  extractGoogleSpreadsheetId,
  WALMART_INSIGHT_PERIODS,
  type WalmartInsightPeriod,
  type WalmartInsights,
  type WalmartSheetRow,
} from '../lib/walmart-insights';
import { authenticatedUserId, type RouteInfrastructure } from './types';

type WalmartWorkbook = {
  title: string;
  orderRows: WalmartSheetRow[];
  itemRows: WalmartSheetRow[];
};

type LoadedWalmartInsights = {
  report: WalmartInsights;
  sheetReadAt: string;
};

type WalmartRouterDependencies = RouteInfrastructure & {
  readWorkbook: (uid: string, spreadsheetId: string) => Promise<WalmartWorkbook>;
  loadInsights: (
    uid: string,
    spreadsheetId: string,
    period: WalmartInsightPeriod,
    forceRefresh: boolean
  ) => Promise<LoadedWalmartInsights>;
  clearCache: (uid: string) => void;
};

function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export function createWalmartRouter(dependencies: WalmartRouterDependencies): express.Router {
  const router = express.Router();
  const { requireAuth, db, now, readWorkbook, loadInsights, clearCache } = dependencies;

  router.get('/api/walmart/source', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.data();
      const spreadsheetId = String(userData?.walmartSpreadsheetId || '').trim();
      if (!spreadsheetId) return res.json({ connected: false });

      res.json({
        connected: true,
        spreadsheetId,
        spreadsheetTitle: String(userData?.walmartSpreadsheetTitle || 'Walmart purchases'),
        spreadsheetUrl: spreadsheetUrl(spreadsheetId),
      });
    } catch (error: any) {
      console.error('Walmart Source Status Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/api/walmart/source', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      const spreadsheetId = extractGoogleSpreadsheetId(req.body?.spreadsheetUrl);
      if (!spreadsheetId) {
        return res.status(400).json({
          code: 'INVALID_WALMART_SPREADSHEET',
          error: 'Enter a valid Google Sheets link for the Walmart export.',
        });
      }

      const workbook = await readWorkbook(uid, spreadsheetId);
      buildWalmartInsights(workbook.orderRows, workbook.itemRows, { period: 'last_12_months' });
      await db.collection('users').doc(uid).set({
        walmartSpreadsheetId: spreadsheetId,
        walmartSpreadsheetTitle: workbook.title,
        walmartSourceConnectedAt: now(),
      }, { merge: true });
      clearCache(uid);

      res.json({
        connected: true,
        spreadsheetId,
        spreadsheetTitle: workbook.title,
        spreadsheetUrl: spreadsheetUrl(spreadsheetId),
      });
    } catch (error: any) {
      const validationError = /(?:must contain tabs named|is missing required columns)/i.test(error?.message || '');
      const status = error?.code === 'GOOGLE_SHEETS_NOT_CONNECTED' ? 409
        : validationError || [403, 404].includes(error?.code || error?.response?.status) ? 400
          : 500;
      console.error('Walmart Source Connect Error:', error);
      res.status(status).json({
        code: error?.code || 'WALMART_SOURCE_ERROR',
        error: validationError
          ? error.message
          : status === 400
            ? 'FinSync could not access that spreadsheet. Confirm the link and that your connected Google account can open it.'
            : error.message,
      });
    }
  });

  router.delete('/api/walmart/source', requireAuth, async (req, res) => {
    try {
      const uid = authenticatedUserId(req);
      await db.collection('users').doc(uid).set({
        walmartSpreadsheetId: FieldValue.delete(),
        walmartSpreadsheetTitle: FieldValue.delete(),
        walmartSourceConnectedAt: FieldValue.delete(),
      }, { merge: true });
      clearCache(uid);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Walmart Source Disconnect Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/walmart/insights', requireAuth, async (req, res) => {
    try {
      const period = String(req.query.period || 'last_12_months');
      if (!WALMART_INSIGHT_PERIODS.includes(period as WalmartInsightPeriod)) {
        return res.status(400).json({
          error: `Invalid period parameter. Allowed: ${WALMART_INSIGHT_PERIODS.join(', ')}`,
        });
      }

      const uid = authenticatedUserId(req);
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.data();
      const spreadsheetId = String(userData?.walmartSpreadsheetId || '').trim();
      if (!spreadsheetId) {
        return res.status(404).json({
          code: 'WALMART_SOURCE_NOT_CONNECTED',
          error: 'Connect your Walmart purchase spreadsheet to view insights.',
        });
      }

      const loaded = await loadInsights(
        uid,
        spreadsheetId,
        period as WalmartInsightPeriod,
        req.query.refresh === 'true'
      );
      res.json({
        source: {
          spreadsheetTitle: String(userData?.walmartSpreadsheetTitle || 'Walmart purchases'),
          spreadsheetUrl: spreadsheetUrl(spreadsheetId),
          sheetReadAt: loaded.sheetReadAt,
        },
        ...loaded.report,
      });
    } catch (error: any) {
      const status = error?.code === 'GOOGLE_SHEETS_NOT_CONNECTED' ? 409 : 500;
      console.error('Walmart Insights Error:', error);
      res.status(status).json({ code: error?.code || 'WALMART_INSIGHTS_ERROR', error: error.message });
    }
  });

  return router;
}
