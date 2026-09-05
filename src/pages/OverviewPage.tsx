import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
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
  getTransactionClassificationLabel,
  getMerchantDisplayLabel,
  formatFriendlyDate,
} from '../lib/formatters';
import { extractOverviewResponse } from '../lib/api-contracts';
import type {
  DashboardSummary,
  TrendPoint,
  DashboardVerificationResponse,
  Transaction,
  RecurringObligationsResponse,
  HouseholdInsights,
  AccountBalanceSummary,
  CashFlowForecast,
} from '../types/finance';

export function OverviewPage({
  apiFetch,
  refreshKey,
  onReviewTransactions,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  onReviewTransactions: () => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [recurringObligations, setRecurringObligations] =
    useState<RecurringObligationsResponse | null>(null);
  const [householdInsights, setHouseholdInsights] =
    useState<HouseholdInsights | null>(null);
  const [verification, setVerification] =
    useState<DashboardVerificationResponse | null>(null);
  const [postedTxs, setPostedTxs] = useState<Transaction[]>([]);
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
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
      setPostedTxs(normalized.postedTransactions);
      setPendingTxs(normalized.pendingTransactions);
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
      {pacing && (
        <div className="text-slate-400">
          On track for about {formatCurrency(pacing.projectedMonthEndSpending)}
        </div>
      )}
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-6">Transactions</h3>

        {pendingTxs.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Pending
            </h4>
            <div className="space-y-3">
              {pendingTxs.map((transaction) => (
  <React.Fragment key={transaction.transactionId}>
    <TransactionRow tx={transaction} />
  </React.Fragment>
))}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Posted
          </h4>
          {loading && postedTxs.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : postedTxs.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-4">
              No posted transactions
            </div>
          ) : (
            <div className="space-y-3">
              {postedTxs.map((transaction) => (
  <React.Fragment key={transaction.transactionId}>
    <TransactionRow tx={transaction} />
  </React.Fragment>
))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500 mb-1">Pending Spending</p>
            <p className="font-medium text-slate-900">
              {formatCurrency(summary?.allTime.pendingSpending)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Active Posted</p>
            <p className="font-medium text-slate-900">
              {summary?.activePostedCount ?? 0} rows
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const isPositive = tx.cashFlowAmount > 0;

  let label = getTransactionClassificationLabel(
    tx.classification,
    tx.isOverridden,
    tx.overrideOffsetCategory
  );
  if (
    tx.classification === 'other' &&
    tx.normalizedCategory.includes('TRANSFER')
  ) {
    label = 'Unclassified transfer';
  }

  const accountContext = [
    tx.institutionName,
    tx.accountName,
    tx.accountMask ? `•••• ${tx.accountMask}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex justify-between items-start gap-3 p-2.5 sm:p-3 hover:bg-slate-50 rounded-xl transition-colors text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate">
          {getMerchantDisplayLabel({
            merchant: tx.normalizedMerchant,
            fallbackDescription: tx.name,
            classification: tx.classification,
          })}
        </p>

        <div className="flex items-center text-xs text-slate-500 mt-0.5 space-x-2 min-w-0">
          <span className="whitespace-nowrap">{formatFriendlyDate(tx.normalizedDate)}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
          <span className="truncate">{label}</span>
          {tx.isOverridden && (
            <span
              className="rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-700"
              title={tx.overrideNote || 'Manually reviewed'}
            >
              Reviewed
            </span>
          )}
        </div>

        {tx.isOverridden && tx.overrideNote && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{tx.overrideNote}</p>
        )}

        {accountContext && (
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{accountContext}</p>
        )}
      </div>

      <div
        className={`font-medium whitespace-nowrap pt-0.5 ${
          isPositive ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {isPositive ? '+' : ''}
        {formatCurrency(tx.cashFlowAmount)}
      </div>
    </div>
  );
}
