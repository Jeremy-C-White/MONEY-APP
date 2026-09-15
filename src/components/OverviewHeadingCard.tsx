import React from 'react';
import { CalendarClock, TrendingUp } from 'lucide-react';
import type { CashFlowForecast, DashboardSummary, HouseholdInsights } from '../types/finance';
import { formatCurrency, formatFriendlyDate, formatPercentagePoints } from '../lib/formatters';

function pacingSentence(pacing: DashboardSummary['pacing'] | undefined): string {
  if (!pacing) return 'There is not enough prior-month data for a pacing comparison yet.';
  if (pacing.spendingDifference === 0) return 'Spending is level with the same point last month.';
  const direction = pacing.spendingDifference > 0 ? 'above' : 'below';
  const percentage = pacing.spendingPercentageChange == null
    ? ''
    : ` (${pacing.spendingPercentageChange > 0 ? '+' : ''}${formatPercentagePoints(pacing.spendingPercentageChange)})`;
  return `Spending is ${formatCurrency(Math.abs(pacing.spendingDifference))} ${direction} the same point last month${percentage}.`;
}

export function OverviewHeadingCard({
  summary,
  insights,
  forecast,
  loading,
}: {
  summary: DashboardSummary | null;
  insights: HouseholdInsights | null;
  forecast: CashFlowForecast | null;
  loading?: boolean;
}) {
  if (loading && !summary && !forecast) {
    return <div className="mb-8 h-80 animate-pulse rounded-2xl bg-slate-100" />;
  }

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Heading</p>
        <h3 className="mt-1 text-lg font-medium text-slate-900">Where this month is going</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-indigo-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Projected month-end spending</p>
          <p className="mt-2 text-2xl font-semibold text-indigo-950">
            {insights ? formatCurrency(insights.forecast.projectedMonthEndSpending) : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Next regular pay</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-950">
            {forecast?.summary.nextPaycheckAmount == null ? '—' : formatCurrency(forecast.summary.nextPaycheckAmount)}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {forecast?.summary.nextPaycheckDate ? formatFriendlyDate(forecast.summary.nextPaycheckDate) : 'No date confirmed'}
          </p>
        </div>
        <div className={`rounded-xl p-4 ${(forecast?.minimumBalance ?? 0) < 0 ? 'bg-rose-50' : 'bg-sky-50'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${(forecast?.minimumBalance ?? 0) < 0 ? 'text-rose-700' : 'text-sky-700'}`}>Lowest scheduled balance</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {forecast?.minimumBalance == null ? '—' : formatCurrency(forecast.minimumBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {forecast?.minimumBalanceDate ? formatFriendlyDate(forecast.minimumBalanceDate) : 'Projection not ready'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600">
        <TrendingUp className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500" />
        <span>{pacingSentence(summary?.pacing)}</span>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            <h4 className="font-semibold text-slate-900">Upcoming bills</h4>
          </div>
          <span className="text-sm font-semibold text-slate-700">
            {forecast ? `${formatCurrency(forecast.summary.upcomingBillTotal)} · ${forecast.summary.upcomingBillCount} confirmed` : '—'}
          </span>
        </div>
        {forecast?.upcomingBills.length ? (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {forecast.upcomingBills.map(event => (
              <li key={event.eventId} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{event.label}</p>
                  <p className="text-xs text-slate-500">{formatFriendlyDate(event.date)}</p>
                </div>
                <span className="whitespace-nowrap font-semibold text-slate-700">{formatCurrency(event.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No confirmed bills are expected in the next 7 days.</p>
        )}
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        {insights ? `${insights.forecast.maturity === 'early' ? 'Early-month estimate' : insights.forecast.maturity === 'developing' ? 'Developing estimate' : 'Established estimate'} · ` : ''}
        Scheduled cash outlook excludes unplanned day-to-day spending.
      </p>
    </section>
  );
}
