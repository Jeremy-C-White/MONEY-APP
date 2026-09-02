import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { RecurringObligationsResponse } from '../types/finance';
import {
  formatCurrency,
  formatFriendlyDate,
  getCategoryLabel,
} from '../lib/formatters';

const cadenceLabels = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

export function RecurringObligationsCard({
  report,
  loading,
}: {
  report: RecurringObligationsResponse | null;
  loading?: boolean;
}) {
  if (loading && !report) {
    return <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const obligations = report?.obligations || [];

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <CalendarClock className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-slate-900">Likely recurring</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Estimated from repeat timing and similar charge amounts. These are planning hints,
              not confirmed bills, and they do not change your financial totals.
            </p>
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Estimated each month
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatCurrency(report?.estimatedMonthlyTotal ?? 0)}
          </p>
        </div>
      </div>

      {obligations.length === 0 ? (
        <div className="mt-6 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No stable recurring charges detected yet.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {obligations.slice(0, 6).map(obligation => (
            <div
              key={`${obligation.merchant}-${obligation.cadence}`}
              className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{obligation.merchant}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {getCategoryLabel(obligation.category)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  obligation.confidence === 'high'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {obligation.confidence}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrency(obligation.estimatedMonthlyAmount)}
                    <span className="ml-1 text-xs font-normal text-slate-400">/ month</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {cadenceLabels[obligation.cadence]} · typical charge{' '}
                    {formatCurrency(obligation.typicalCharge)}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-400">
                {obligation.occurrenceCount} observed · last {formatFriendlyDate(obligation.lastChargeDate)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
