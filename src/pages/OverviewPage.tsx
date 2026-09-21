import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, ChevronRight, RefreshCcw } from 'lucide-react';
import { TrendChart } from '../components/TrendChart';
import { NetWorthTrendChart } from '../components/NetWorthTrendChart';
import { OverviewHeadingCard } from '../components/OverviewHeadingCard';
import { OverviewNowCard } from '../components/OverviewNowCard';
import { CategoryBreakdownCard, type SpendingDrilldown } from '../components/CategoryBreakdownCard';
import { CoverageCard } from '../components/CoverageCard';
import { formatCurrency, formatMonthLabel } from '../lib/formatters';
import { extractOverviewResponse, extractTrendsResponse } from '../lib/api-contracts';
import { INSIGHT_PERIOD_OPTIONS } from '../lib/insight-periods';
import type { DashboardOverviewResponse, TrendPoint, WalmartInsightPeriod } from '../types/finance';

export function OverviewPage({ apiFetch, refreshKey, onReviewTransactions, onViewTransactions, onOpenPlanSettings, onOpenAccounts = () => undefined, onOpenShopping = () => undefined }: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  onReviewTransactions: () => void;
  onViewTransactions: (filters?: SpendingDrilldown) => void;
  onOpenPlanSettings?: () => void;
  onOpenAccounts?: () => void;
  onOpenShopping?: () => void;
}) {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<WalmartInsightPeriod>('last_30_days');
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/dashboard/overview?range=last_12_months');
      if (!response.ok) throw new Error('Failed to load overview data.');
      setOverview(extractOverviewResponse(await response.json()));
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred loading your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchData(); }, [refreshKey]);

  useEffect(() => {
    let active = true;
    const loadTrends = async () => {
      setTrendsLoading(true);
      try {
        const response = await apiFetch(`/api/dashboard/trends?range=${period}`);
        if (!response.ok) throw new Error('Failed to load trend data.');
        const next = extractTrendsResponse(await response.json());
        if (active) setTrends(next);
      } catch (trendError) {
        console.error(trendError);
      } finally {
        if (active) setTrendsLoading(false);
      }
    };
    void loadTrends();
    return () => { active = false; };
  }, [apiFetch, period, refreshKey]);

  if (error && !overview) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50"><AlertCircle className="h-6 w-6 text-rose-500" /></div>
        <h3 className="mb-2 text-lg font-medium text-slate-900">Unable to load dashboard</h3>
        <p className="mb-6 max-w-sm text-center text-slate-500">{error}</p>
        <button onClick={() => void fetchData()} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700"><RefreshCcw className="h-4 w-4" />Retry</button>
      </div>
    );
  }

  const periodLabel = INSIGHT_PERIOD_OPTIONS.find(option => option.value === period)?.label || '30D';

  return (
    <div className="w-full pb-20 md:pb-8">
      {overview?.summary.currentMonth.month && <h1 className="mb-5 text-xl font-semibold text-slate-950">{formatMonthLabel(overview.summary.currentMonth.month)}</h1>}
      {error && overview && <div className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-700"><span className="text-xs font-medium">Refresh failed. Showing the last known state.</span><button onClick={() => void fetchData()} className="text-xs font-medium underline">Retry</button></div>}
      {overview?.verification.reconciliation.unknownTransferCount ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <span>{overview.verification.reconciliation.unknownTransferCount} unclassified {overview.verification.reconciliation.unknownTransferCount === 1 ? 'transfer' : 'transfers'} ({formatCurrency(overview.verification.reconciliation.unknownTransferAmount)}) excluded from totals.</span>
          <button onClick={onReviewTransactions} className="font-semibold underline">Review</button>
        </div>
      ) : null}

      <OverviewNowCard safeToSpend={overview?.safeToSpend || null} financialPosition={overview?.financialPosition || null} insights={overview?.householdInsights || null} loading={loading && !overview} onEditBuffer={onOpenPlanSettings} onOpenAccounts={onOpenAccounts} />
      <OverviewHeadingCard summary={overview?.summary || null} insights={overview?.householdInsights || null} forecast={overview?.cashFlowForecast || null} loading={loading && !overview} />

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">Where your money went</h2>
          <PeriodControl period={period} onChange={setPeriod} />
        </div>
        <CategoryBreakdownCard apiFetch={apiFetch} refreshKey={refreshKey} period={period} onDrillDown={onViewTransactions} onOpenShopping={onOpenShopping} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-950">Trends</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm md:p-7">
            <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-950">Cash flow</h3><span className="text-xs font-medium text-slate-500">{periodLabel}</span></div>
            <TrendChart data={trends} loading={trendsLoading && trends.length === 0} />
            {overview?.yearOverYear.status === 'comparable' && (
              <p className={`mt-3 text-xs font-medium ${overview.yearOverYear.difference > 0 ? 'text-rose-600' : overview.yearOverYear.difference < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>This month is {overview.yearOverYear.difference === 0 ? 'level with' : `${formatCurrency(Math.abs(overview.yearOverYear.difference))} ${overview.yearOverYear.difference > 0 ? 'above' : 'below'}`} the same days last year.</p>
            )}
            {overview?.yearOverYear.status === 'not_comparable' && (
              <p className="mt-3 text-xs text-slate-500">Year-over-year is not comparable — {overview.yearOverYear.addedAccountCount > 0 ? `${overview.yearOverYear.addedAccountCount} ${overview.yearOverYear.addedAccountCount === 1 ? 'account was' : 'accounts were'} added since last year.` : `${overview.yearOverYear.removedAccountCount} ${overview.yearOverYear.removedAccountCount === 1 ? 'account is' : 'accounts are'} no longer represented.`}</p>
            )}
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm md:p-7">
            <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-950">Net worth history</h3><span className="text-xs font-medium text-slate-500">Last 12 months</span></div>
            <NetWorthTrendChart financialPosition={overview?.financialPosition || null} />
          </div>
        </div>
      </section>

      <div className="mb-4 rounded-2xl bg-white px-5 shadow-sm md:px-7">
        <button type="button" onClick={() => overview?.rewardsYtd && onViewTransactions({ category: 'REWARDS', startDate: overview.rewardsYtd.startDate, endDate: overview.rewardsYtd.endDate })} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
          <span className="flex-1 text-sm font-medium text-slate-800">Cash back this year</span>
          <span className="tabular-nums text-sm font-semibold text-slate-950">{overview?.rewardsYtd ? formatCurrency(overview.rewardsYtd.amount) : 'Not available'}</span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </button>
      </div>
      <CoverageCard coverage={overview?.coverage || null} loading={loading && !overview} onViewTransactions={onViewTransactions} onOpenAccounts={onOpenAccounts} />

      <div className="mt-6 flex justify-end"><button type="button" onClick={() => onViewTransactions()} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:text-indigo-700">View all transactions <ArrowRight className="h-4 w-4" /></button></div>
    </div>
  );
}

function PeriodControl({ period, onChange }: { period: WalmartInsightPeriod; onChange: (period: WalmartInsightPeriod) => void }) {
  return (
    <div className="flex rounded-lg bg-slate-200/70 p-1" aria-label="Overview period">
      {INSIGHT_PERIOD_OPTIONS.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`flex min-h-9 min-w-11 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium ${period === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{option.label}</button>)}
    </div>
  );
}
