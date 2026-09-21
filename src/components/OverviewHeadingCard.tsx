import React, { useState } from 'react';
import type { CashFlowForecast, DashboardSummary, HouseholdInsights } from '../types/finance';
import { formatCurrency, formatFriendlyDate } from '../lib/formatters';

export function OverviewHeadingCard({
  forecast,
  loading,
}: {
  summary: DashboardSummary | null;
  insights: HouseholdInsights | null;
  forecast: CashFlowForecast | null;
  loading?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  if (loading && !forecast) {
    return <div className="mb-6 h-72 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const bills = forecast?.upcomingBills || [];
  const visibleBills = showAll ? bills : bills.slice(0, 3);

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm md:p-7">
      <h2 className="text-lg font-semibold text-slate-950">Coming up</h2>
      <div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
        <div className="flex min-h-16 items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Next pay</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {forecast?.summary.nextPaycheckDate ? formatFriendlyDate(forecast.summary.nextPaycheckDate) : 'No date confirmed'}
            </p>
          </div>
          <p className="tabular-nums text-sm font-semibold text-slate-950">
            {forecast?.summary.nextPaycheckAmount == null ? 'Not available' : formatCurrency(forecast.summary.nextPaycheckAmount)}
          </p>
        </div>

        {visibleBills.map(event => (
          <div key={event.eventId} className="flex min-h-16 items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-700">{event.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{formatFriendlyDate(event.date)}</p>
            </div>
            <p className="shrink-0 tabular-nums text-sm font-semibold text-slate-950">{formatCurrency(event.amount)}</p>
          </div>
        ))}

        {bills.length === 0 && (
          <div className="py-4 text-sm text-slate-500">No confirmed bills are expected in the next 7 days.</div>
        )}

        <div className="flex min-h-16 items-center justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Lowest scheduled balance</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {forecast?.minimumBalanceDate ? formatFriendlyDate(forecast.minimumBalanceDate) : 'Projection not ready'}
            </p>
          </div>
          <p className={`tabular-nums text-sm font-semibold ${(forecast?.minimumBalance ?? 0) < 0 ? 'text-rose-600' : 'text-slate-950'}`}>
            {forecast?.minimumBalance == null ? 'Not available' : formatCurrency(forecast.minimumBalance)}
          </p>
        </div>
      </div>

      {bills.length > 3 && (
        <button type="button" onClick={() => setShowAll(value => !value)} className="mt-3 min-h-9 text-sm font-medium text-indigo-600 hover:text-indigo-800">
          {showAll ? 'Show less' : `See all ${bills.length} bills`}
        </button>
      )}
      {forecast?.warning && (
        <p className="mt-3 text-xs leading-5 text-amber-700">{forecast.warning}</p>
      )}
    </section>
  );
}
