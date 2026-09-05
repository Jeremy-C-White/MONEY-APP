import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, RefreshCcw } from 'lucide-react';
import { TrendChart } from '../components/TrendChart';
import { RecurringObligationsCard } from '../components/RecurringObligationsCard';
import { HouseholdInsightsCard } from '../components/HouseholdInsightsCard';
import { AccountPositionCards } from '../components/AccountPositionCards';
import { CashFlowForecastCard } from '../components/CashFlowForecastCard';
import { CategoryBreakdownCard } from '../components/CategoryBreakdownCard';
import {
  formatCurrency,
  formatPercentagePoints,
  formatMonthLabel,
} from '../lib/formatters';
import { extractOverviewResponse } from '../lib/api-contracts';
import type {
  DashboardSummary,
  TrendPoint,
  DashboardVerificationResponse,
  RecurringObligationsResponse,
  HouseholdInsights,
  AccountBalanceSummary,
  CashFlowForecast,
} from '../types/finance';

export function OverviewPage({
  apiFetch,
  refreshKey,
  onReviewTransactions,
  onViewTransactions,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  onReviewTransactions: () => void;
  onViewTransactions: () => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [recurringObligations, setRecurringObligations] =
    useState<RecurringObligationsResponse | null>(null);
  const [householdInsights, setHouseholdInsights] =
    useState<HouseholdInsights | null>(null);
  const [verification, setVerification] =
    useState<DashboardVerificationResponse | null>(null);
  const [accountBalances, setAccountBalances] = useState<AccountBalanceSummary | null>(null);
  const [cashFlowForecast, setCashFlowForecast] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendRange, setTrendRange] =
    useState<'6m' | '12m' | 'ytd'>('12m');

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/dashboard/overview?range=${trendRange}`);
      if (!response.ok) {
        throw new Error('Failed to load overview data.');
      }
      const normalized = extractOverviewResponse(await response.json());

      setSummary(normalized.summary);
      setTrends(normalized.trends);
      setRecurringObligations(normalized.recurringObligations);
      setHouseholdInsights(normalized.householdInsights);
      setVerification(normalized.verification);
      setAccountBalances(normalized.accountBalances);
      setCashFlowForecast(normalized.cashFlowForecast);
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred loading your dashboard.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [trendRange, refreshKey]);

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-sm border border-rose-100">
        <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-rose-500" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">
          Unable to load dashboard
        </h3>
        <p className="text-slate-500 text-center mb-6 max-w-sm">{error}</p>
        <button
          onClick={() => void fetchData()}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-medium transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const pacing = summary?.pacing;
  const pacedDiff = pacing?.spendingDifference;
  const pacedPct = pacing?.spendingPercentageChange;

  const spendingSubtitle = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-1">
        {pacedDiff != null ? (
          <>
            <span
              className={
                pacedDiff > 0
                  ? 'text-rose-500 font-medium'
                  : 'text-emerald-500 font-medium'
              }
            >
              {pacedDiff > 0 ? '+' : ''}
              {formatCurrency(pacedDiff)}
            </span>
            {pacedPct != null && (
              <span className="text-slate-400">
                ({pacedPct > 0 ? '+' : ''}
                {formatPercentagePoints(pacedPct)})
              </span>
            )}
            <span className="text-slate-400">
              vs {formatCurrency(pacing?.previousMonthToDateSpending)} at this point last month
            </span>
          </>
        ) : (
          <span className="text-slate-400">No previous data</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full pb-20 md:pb-8">
      {summary?.currentMonth.month && (
        <h2 className="text-xl font-bold text-slate-900 mb-6">
          {formatMonthLabel(summary.currentMonth.month)}
        </h2>
      )}

      {error && summary && (
        <div className="mb-6 p-4 rounded-xl flex items-center justify-between gap-4 shadow-sm bg-rose-50 text-rose-700 border border-rose-200">
          <span className="text-sm font-medium">
            Failed to refresh some data. Showing last known state.
          </span>
          <button
            onClick={() => void fetchData()}
            className="opacity-75 hover:opacity-100 text-sm font-medium underline whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {verification?.reconciliation.unknownTransferCount ? (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 sm:mt-0 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-amber-900">Needs Review</h4>
              <p className="text-sm text-amber-700">
                {verification.reconciliation.unknownTransferCount}{' '}
                {verification.reconciliation.unknownTransferCount === 1
                  ? 'transfer'
                  : 'transfers'}{' '}
                ({formatCurrency(verification.reconciliation.unknownTransferAmount)})
                {' '}are excluded from recognized spending/income until their meaning is clear.
              </p>
            </div>
          </div>
          <button
            onClick={onReviewTransactions}
            className="px-4 py-2 bg-white border border-amber-200 hover:bg-amber-100 text-amber-800 text-sm font-medium rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            Review transactions
          </button>
        </div>
      ) : null}

      <AccountPositionCards
        balances={accountBalances}
        spending={summary?.currentMonth.spending}
        spendingSubtitle={spendingSubtitle}
        projectedMonthEndSpending={householdInsights?.forecast.projectedMonthEndSpending}
        projectionMaturity={householdInsights?.forecast.maturity}
        loading={loading && !summary}
      />

      <CashFlowForecastCard
        forecast={cashFlowForecast}
        loading={loading && !cashFlowForecast}
      />

      <HouseholdInsightsCard
        insights={householdInsights}
        loading={loading && !householdInsights}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 overflow-hidden mb-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h3 className="text-lg font-medium text-slate-900">Cash Flow Trends</h3>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['6m', '12m', 'ytd'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTrendRange(range)}
                className={`px-3 sm:px-4 py-1.5 text-xs font-medium rounded-md uppercase min-w-[44px] min-h-[44px] sm:min-h-0 flex items-center justify-center ${
                  trendRange === range
                    ? 'bg-white shadow-sm text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <TrendChart data={trends} loading={loading && trends.length === 0} />
        <div className="flex justify-center space-x-6 mt-4">
          <div className="flex items-center text-sm text-slate-500">
            <div className="w-3 h-3 bg-emerald-400 rounded-sm mr-2" />
            Income
          </div>
          <div className="flex items-center text-sm text-slate-500">
            <div className="w-3 h-3 bg-indigo-400 rounded-sm mr-2" />
            Spending
          </div>
          <div className="flex items-center text-sm text-slate-500">
            <div className="w-4 h-0.5 bg-slate-900 mr-2" />
            Net cash flow
          </div>
        </div>
      </div>

      <CategoryBreakdownCard apiFetch={apiFetch} refreshKey={refreshKey} />

      <div className="mb-8">
        <RecurringObligationsCard
          report={recurringObligations}
          loading={loading && !recurringObligations}
          apiFetch={apiFetch}
          onChanged={fetchData}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onViewTransactions}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          View all transactions
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
