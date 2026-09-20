import express from 'express';
import {
  aggregateCategories,
  aggregateMerchants,
  aggregatePeriodCategoryBreakdown,
  aggregateSummary,
  aggregateTrends,
  buildVerificationReport,
  CATEGORY_PERIODS,
  type CategoryPeriod,
} from '../lib/aggregations';
import type { AccountRole } from '../lib/account-roles';
import type { AccountRoleSummary } from '../lib/account-role-view';
import type { AccountBalanceSummary } from '../lib/account-balances';
import { buildCashFlowForecast } from '../lib/cash-flow-forecast';
import { buildCoverageReport } from '../lib/coverage';
import type { FinancialPosition } from '../lib/financial-position';
import { buildHouseholdInsights } from '../lib/household-insights';
import type { HouseholdPlan } from '../lib/household-plan';
import { applyMerchantFamilies } from '../lib/merchant-families';
import { buildMerchantComparison } from '../lib/merchant-comparison';
import type { RecurringPlanningReport } from '../lib/recurring-obligation-decisions';
import { buildRewardsYtd } from '../lib/rewards';
import { buildSafeToSpend } from '../lib/safe-to-spend';
import { buildSpendingBreakdown } from '../lib/spending-breakdown';
import { getDateForDateInTimezone } from '../lib/time';
import type { EnrichedTransaction } from '../lib/transaction-enrichment';
import type { UnifiedAccount } from '../lib/unified-accounts';
import { analyzeTransferCoverage } from '../lib/transfer-coverage';
import { WALMART_INSIGHT_PERIODS, type WalmartInsightPeriod } from '../lib/walmart-insights';
import { buildYearOverYearComparison } from '../lib/year-over-year';
import { authenticatedUserId } from './types';

export type RecurringPlanningContext = {
  txs: EnrichedTransaction[];
  recurringObligations: RecurringPlanningReport;
  householdPlan: HouseholdPlan;
  financeTz: string;
  now: Date;
};

export type FinancialAccountContext = {
  accounts: UnifiedAccount[];
  summary: AccountRoleSummary;
  linkedBalances: AccountBalanceSummary;
  overrides: Map<string, AccountRole>;
  financialPosition: FinancialPosition;
};

type DashboardRouterDependencies = {
  requireAuth: express.RequestHandler;
  loadTransactions: (uid: string) => Promise<EnrichedTransaction[]>;
  loadRecurringPlanning: (uid: string) => Promise<RecurringPlanningContext>;
  loadFinancialAccountContext: (uid: string) => Promise<FinancialAccountContext>;
  currentDate: () => Date;
  financeTimeZone: string;
};

export function createDashboardRouter(dependencies: DashboardRouterDependencies): express.Router {
  const router = express.Router();
  const {
    requireAuth,
    loadTransactions,
    loadRecurringPlanning,
    loadFinancialAccountContext,
    currentDate,
    financeTimeZone,
  } = dependencies;

  router.get('/api/dashboard/summary', requireAuth, async (req, res) => {
    try {
      res.json(aggregateSummary(await loadTransactions(authenticatedUserId(req)), financeTimeZone));
    } catch (error: any) {
      console.error('Dashboard Summary Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/categories', requireAuth, async (req, res) => {
    try {
      res.json({ categories: aggregateCategories(await loadTransactions(authenticatedUserId(req))) });
    } catch (error: any) {
      console.error('Dashboard Categories Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/merchants', requireAuth, async (req, res) => {
    try {
      const txs = applyMerchantFamilies(await loadTransactions(authenticatedUserId(req)));
      const asOfDate = getDateForDateInTimezone(currentDate(), financeTimeZone);
      res.json({
        merchants: aggregateMerchants(txs).slice(0, 50),
        comparison: buildMerchantComparison({ transactions: txs, asOfDate, limit: 10 }),
      });
    } catch (error: any) {
      console.error('Dashboard Merchants Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/category-breakdown', requireAuth, async (req, res) => {
    try {
      const period = String(req.query.period || 'this_month');
      if (!CATEGORY_PERIODS.includes(period as CategoryPeriod)) {
        return res.status(400).json({ error: `Invalid period parameter. Allowed: ${CATEGORY_PERIODS.join(', ')}` });
      }
      const txs = applyMerchantFamilies(await loadTransactions(authenticatedUserId(req)));
      res.json(aggregatePeriodCategoryBreakdown(txs, period as CategoryPeriod, financeTimeZone));
    } catch (error: any) {
      console.error('Dashboard Category Breakdown Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/spending-breakdown', requireAuth, async (req, res) => {
    try {
      const period = String(req.query.period || 'last_30_days');
      if (!WALMART_INSIGHT_PERIODS.includes(period as WalmartInsightPeriod)) {
        return res.status(400).json({ error: `Invalid period parameter. Allowed: ${WALMART_INSIGHT_PERIODS.join(', ')}` });
      }
      res.json(buildSpendingBreakdown({
        transactions: await loadTransactions(authenticatedUserId(req)),
        period: period as WalmartInsightPeriod,
        asOfDate: getDateForDateInTimezone(currentDate(), financeTimeZone),
      }));
    } catch (error: any) {
      console.error('Dashboard Spending Breakdown Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/trends', requireAuth, async (req, res) => {
    try {
      const range = String(req.query.range || 'last_12_months');
      if (!WALMART_INSIGHT_PERIODS.includes(range as WalmartInsightPeriod)) {
        return res.status(400).json({ error: `Invalid range parameter. Allowed: ${WALMART_INSIGHT_PERIODS.join(', ')}` });
      }
      res.json({
        monthly: aggregateTrends(
          await loadTransactions(authenticatedUserId(req)),
          range as WalmartInsightPeriod,
          financeTimeZone
        ),
      });
    } catch (error: any) {
      console.error('Dashboard Trends Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/overview', requireAuth, async (req, res) => {
    try {
      const range = String(req.query.range || 'last_12_months');
      if (!WALMART_INSIGHT_PERIODS.includes(range as WalmartInsightPeriod)) {
        return res.status(400).json({ error: `Invalid range parameter. Allowed: ${WALMART_INSIGHT_PERIODS.join(', ')}` });
      }

      const uid = authenticatedUserId(req);
      const [planning, accountContext] = await Promise.all([
        loadRecurringPlanning(uid),
        loadFinancialAccountContext(uid),
      ]);
      const { txs, recurringObligations, householdPlan, financeTz, now } = planning;
      const accountBalances = accountContext.linkedBalances;
      const asOfDate = getDateForDateInTimezone(now, financeTz);
      const trends = aggregateTrends(txs, range as WalmartInsightPeriod, financeTz);
      const earliestTrendMonth = trends[0]?.month.slice(0, 7) || null;
      const financialPosition = {
        ...accountContext.financialPosition,
        netWorthHistory: accountContext.financialPosition.netWorthHistory.filter(point => (
          !earliestTrendMonth || point.date.slice(0, 7) >= earliestTrendMonth
        )),
      };
      const verification = buildVerificationReport(txs, financeTz);
      const householdInsights = buildHouseholdInsights(txs, recurringObligations.obligations, asOfDate);

      res.json({
        summary: verification.summary,
        trends,
        householdInsights,
        verification,
        accountBalances,
        financialPosition,
        cashFlowForecast: buildCashFlowForecast({
          transactions: txs,
          recurringObligations: recurringObligations.obligations,
          accountBalances,
          asOfDate,
        }),
        safeToSpend: buildSafeToSpend({
          transactions: txs,
          recurringObligations: recurringObligations.obligations,
          accountBalances,
          accountRoleOverrides: accountContext.overrides,
          plan: householdPlan,
          asOfDate,
        }),
        rewardsYtd: buildRewardsYtd(txs, asOfDate),
        yearOverYear: buildYearOverYearComparison({ transactions: txs, asOfDate }),
        coverage: buildCoverageReport({
          transactions: txs,
          accounts: accountContext.accounts,
          asOfDate,
        }),
      });
    } catch (error: any) {
      console.error('Dashboard Overview Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/household-insights', requireAuth, async (req, res) => {
    try {
      const { txs, recurringObligations, financeTz, now } = await loadRecurringPlanning(authenticatedUserId(req));
      res.json({
        recurringObligations,
        insights: buildHouseholdInsights(
          txs,
          recurringObligations.obligations,
          getDateForDateInTimezone(now, financeTz)
        ),
      });
    } catch (error: any) {
      console.error('Household Insights Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/recurring-obligations', requireAuth, async (req, res) => {
    try {
      const { recurringObligations } = await loadRecurringPlanning(authenticatedUserId(req));
      res.json(recurringObligations);
    } catch (error: any) {
      console.error('Recurring Obligations Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/dashboard/verification', requireAuth, async (req, res) => {
    try {
      const txs = await loadTransactions(authenticatedUserId(req));
      const report = buildVerificationReport(txs, financeTimeZone);
      res.json({ ...report, transferCoverage: analyzeTransferCoverage(txs) });
    } catch (error: any) {
      console.error('Verification Report Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
