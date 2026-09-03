import React from 'react';
import { CalendarDays, Compass, TrendingDown, TrendingUp } from 'lucide-react';
import type { HouseholdInsights } from '../types/finance';
import {
  formatCurrency,
  formatFriendlyDate,
  formatMonthLabel,
  formatPercentagePoints,
  getCategoryLabel,
} from '../lib/formatters';

function periodLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatFriendlyDate(startDate);
  return `${formatFriendlyDate(startDate)} – ${formatFriendlyDate(endDate)}`;
}

function differenceClasses(difference: number): string {
  if (difference > 0) return 'text-rose-600';
  if (difference < 0) return 'text-emerald-600';
  return 'text-slate-500';
}

function signedCurrency(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`;
}

function maturityLabel(maturity: HouseholdInsights['forecast']['maturity']): string {
  if (maturity === 'early') return 'Early estimate';
  if (maturity === 'developing') return 'Developing estimate';
  return 'Established estimate';
}

export function HouseholdInsightsCard({
  insights,
  loading,
}: {
  insights: HouseholdInsights | null;
  loading?: boolean;
}) {
  if (loading && !insights) {
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!insights) return null;

  const { weekly, monthly, forecast } = insights;

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-slate-900">Household insights</h3>
        <p className="mt-1 text-sm text-slate-500">
          What changed, how this week is going, and where spending is currently heading.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <CalendarDays className="h-4 w-4 text-indigo-600" />
            <h4 className="font-semibold">This week</h4>
          </div>
          <p className="mt-4 text-3xl font-semibold text-slate-900">
            {formatCurrency(weekly.current.spending)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Posted spending · {periodLabel(weekly.current.startDate, weekly.current.endDate)}
          </p>

          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span className="text-slate-500">Same days last week</span>
              <div className="text-right">
                <p className="font-semibold text-slate-900">
                  {formatCurrency(weekly.previousComparable.spending)}
                </p>
                <p className={`text-xs font-medium ${differenceClasses(weekly.spendingDifference)}`}>
                  {signedCurrency(weekly.spendingDifference)}
                  {weekly.spendingPercentageChange != null
                    ? ` (${formatPercentagePoints(weekly.spendingPercentageChange)})`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Last full week</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(weekly.previousFull.spending)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Income this week</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(weekly.current.income)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Pending this week</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(weekly.pendingSpending)}
              </span>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            <h4 className="font-semibold">What changed this month</h4>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Compared with the same number of days last month.
          </p>

          <div className="mt-4 rounded-lg bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-slate-900">
                  {formatCurrency(monthly.current.spending)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {formatCurrency(monthly.previousComparable.spending)} at this point last month
                </p>
              </div>
              <p className={`text-sm font-semibold ${differenceClasses(monthly.spendingDifference)}`}>
                {signedCurrency(monthly.spendingDifference)}
                {monthly.spendingPercentageChange != null
                  ? ` (${formatPercentagePoints(monthly.spendingPercentageChange)})`
                  : ''}
              </p>
            </div>
          </div>

          {monthly.categoryChanges.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No category changes to show yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {monthly.categoryChanges.slice(0, 5).map(change => (
                <div key={change.category} className="rounded-lg bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {getCategoryLabel(change.category)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {formatCurrency(change.currentSpending)} now ·{' '}
                        {formatCurrency(change.previousSpending)} before
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-semibold ${differenceClasses(change.difference)}`}>
                      {change.difference > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                      <span>{signedCurrency(change.difference)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Last full month</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(monthly.previousFull.spending)}
              </span>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Compass className="h-4 w-4 text-indigo-600" />
            <h4 className="font-semibold">Where this month is heading</h4>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-3xl font-semibold text-slate-900">
              {formatCurrency(forecast.projectedMonthEndSpending)}
            </p>
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
              {maturityLabel(forecast.maturity)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Projected spending for {formatMonthLabel(forecast.month)}
          </p>

          <div className="mt-5 space-y-3 border-t border-indigo-100 pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Posted so far</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(forecast.postedSpending)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Pending</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(forecast.pendingSpending)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Confirmed services still expected</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(forecast.confirmedRecurringRemaining)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Variable spending estimate remaining</span>
              <span className="font-semibold text-slate-900">
                {formatCurrency(forecast.projectedVariableRemaining)}
              </span>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Confirmed recurring services are counted once. Pending charges are included,
            while unconfirmed recurring suggestions are excluded.
          </p>
        </article>
      </div>
    </section>
  );
}
