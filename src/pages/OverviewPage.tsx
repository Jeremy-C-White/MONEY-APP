import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, RefreshCcw } from 'lucide-react';
import { TrendChart } from '../components/TrendChart';
import { NetWorthTrendChart } from '../components/NetWorthTrendChart';
import { OverviewHeadingCard } from '../components/OverviewHeadingCard';
import { OverviewNowCard } from '../components/OverviewNowCard';
import { CategoryBreakdownCard, type SpendingDrilldown } from '../components/CategoryBreakdownCard';
import { formatCurrency, formatMonthLabel } from '../lib/formatters';
import { extractOverviewResponse } from '../lib/api-contracts';
import type { DashboardOverviewResponse, SpendingPeriod } from '../types/finance';

export function OverviewPage({
  apiFetch,
  refreshKey,
  onReviewTransactions,
  onViewTransactions,
  onOpenPlanSettings,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  onReviewTransactions: () => void;
  onViewTransactions: (filters?: SpendingDrilldown) => void;
  onOpenPlanSettings?: () => void;
}) {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<'6m' | '12m' | '24m' | 'ytd'>('12m');
  const [spendingPeriod, setSpendingPeriod] = useState<SpendingPeriod>('last_30_days');
  const [snapshotting, setSnapshotting] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/dashboard/overview?range=${trendRange}`);
      if (!response.ok) throw new Error('Failed to load overview data.');
      setOverview(extractOverviewResponse(await response.json()));
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred loading your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [trendRange, refreshKey]);

  const captureSnapshot = async () => {
    setSnapshotting(true);
    setSnapshotMessage(null);
    setSnapshotError(null);
    try {
      const response = await apiFetch('/api/account-balances/refresh', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to capture balances.');
      const issueCount = Array.isArray(payload?.errors) ? payload.errors.length : 0;
      setSnapshotMessage(issueCount > 0
        ? `Today's snapshot was saved with ${issueCount} connection ${issueCount === 1 ? 'issue' : 'issues'}.`
        : "Today's net-worth snapshot was saved.");
      await fetchData();
    } catch (snapshotCaptureError) {
      setSnapshotError(snapshotCaptureError instanceof Error
        ? snapshotCaptureError.message
        : 'Unable to capture balances.');
    } finally {
      setSnapshotting(false);
    }
  };

  if (error && !overview) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-100 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
          <AlertCircle className="h-6 w-6 text-rose-500" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-slate-900">Unable to load dashboard</h3>
        <p className="mb-6 max-w-sm text-center text-slate-500">{error}</p>
        <button onClick={() => void fetchData()} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 font-medium text-white transition-colors hover:bg-indigo-700">
          <RefreshCcw className="h-4 w-4" /><span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full pb-20 md:pb-8">
      {overview?.summary.currentMonth.month && (
        <h2 className="mb-6 text-xl font-bold text-slate-900">{formatMonthLabel(overview.summary.currentMonth.month)}</h2>
      )}

      {error && overview && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
          <span className="text-xs font-medium">Refresh failed. Showing the last known state.</span>
          <button onClick={() => void fetchData()} className="text-xs font-medium underline">Retry</button>
        </div>
      )}

      {overview?.verification.reconciliation.unknownTransferCount ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            <AlertCircle className="mr-1.5 inline h-4 w-4" />
            {overview.verification.reconciliation.unknownTransferCount} unclassified {overview.verification.reconciliation.unknownTransferCount === 1 ? 'transfer' : 'transfers'} ({formatCurrency(overview.verification.reconciliation.unknownTransferAmount)}) excluded from totals.
          </span>
          <button onClick={onReviewTransactions} className="font-semibold underline">Review</button>
        </div>
      ) : null}

      <OverviewNowCard
        safeToSpend={overview?.safeToSpend || null}
        financialPosition={overview?.financialPosition || null}
        insights={overview?.householdInsights || null}
        loading={loading && !overview}
        onEditBuffer={onOpenPlanSettings}
      />

      <OverviewHeadingCard
        summary={overview?.summary || null}
        insights={overview?.householdInsights || null}
        forecast={overview?.cashFlowForecast || null}
        loading={loading && !overview}
      />

      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Looking back</p>
            <h3 className="mt-1 text-lg font-medium text-slate-900">How your money has moved</h3>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {(['6m', '12m', '24m', 'ytd'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTrendRange(range)}
                className={`flex min-h-9 min-w-11 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium uppercase ${trendRange === range ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-medium text-slate-900">Net worth history</h3>
              <button
                type="button"
                onClick={() => void captureSnapshot()}
                disabled={snapshotting}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${snapshotting ? 'animate-spin' : ''}`} />
                {snapshotting ? 'Capturing…' : 'Capture today'}
              </button>
            </div>
            {snapshotMessage && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{snapshotMessage}</p>}
            {snapshotError && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{snapshotError}</p>}
            <NetWorthTrendChart financialPosition={overview?.financialPosition || null} />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
            <h3 className="mb-4 text-lg font-medium text-slate-900">Cash flow trends</h3>
            <TrendChart data={overview?.trends || []} loading={loading && !overview} />
            {overview?.yearOverYear.status === 'comparable' && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${overview.yearOverYear.difference > 0 ? 'bg-rose-50 text-rose-700' : overview.yearOverYear.difference < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'}`}>
                This month is {overview.yearOverYear.difference === 0
                  ? 'level with'
                  : `${formatCurrency(Math.abs(overview.yearOverYear.difference))} ${overview.yearOverYear.difference > 0 ? 'above' : 'below'}`} the same days last year.
              </p>
            )}
            {overview?.yearOverYear.status === 'not_comparable' && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                Year-over-year is not comparable
                {overview.yearOverYear.addedAccountCount > 0
                  ? ` — ${overview.yearOverYear.addedAccountCount} ${overview.yearOverYear.addedAccountCount === 1 ? 'account was' : 'accounts were'} added since last year.`
                  : ` — ${overview.yearOverYear.removedAccountCount} ${overview.yearOverYear.removedAccountCount === 1 ? 'account is' : 'accounts are'} no longer represented.`}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium text-slate-900">Where your money went</h3>
              <p className="mt-1 text-xs text-slate-500">Top five by default, with more detail when you want it</p>
            </div>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {([
                ['last_7_days', '7D'],
                ['last_30_days', '30D'],
                ['last_3_months', '3M'],
                ['last_12_months', '12M'],
              ] as const).map(([period, label]) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setSpendingPeriod(period)}
                  className={`flex min-h-9 min-w-11 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium ${spendingPeriod === period ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <CategoryBreakdownCard
            apiFetch={apiFetch}
            refreshKey={refreshKey}
            period={spendingPeriod}
            onDrillDown={onViewTransactions}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={() => onViewTransactions()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
          View all transactions <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
