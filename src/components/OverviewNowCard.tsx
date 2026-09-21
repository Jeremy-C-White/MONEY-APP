import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { FinancialPosition, HouseholdInsights, SafeToSpend } from '../types/finance';
import { formatCurrency } from '../lib/formatters';

function changeText(value: number, comparison: string): React.ReactNode {
  if (value === 0) return <span className="text-slate-500">Level with {comparison}</span>;
  return (
    <span className={value > 0 ? 'text-rose-600' : 'text-emerald-600'}>
      {formatCurrency(Math.abs(value))} {value > 0 ? 'more' : 'less'} than {comparison}
    </span>
  );
}

function PositionRow({ label, value, onClick }: {
  label: string;
  value: number | null | undefined;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 py-3 text-left transition-colors hover:text-indigo-700"
    >
      <span className="flex-1 text-sm font-medium text-slate-700">{label}</span>
      <span className="tabular-nums text-sm font-semibold text-slate-950">
        {value == null ? 'Not available' : formatCurrency(value)}
      </span>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </button>
  );
}

export function OverviewNowCard({
  safeToSpend,
  financialPosition,
  insights,
  loading,
  onEditBuffer,
  onOpenAccounts,
}: {
  safeToSpend: SafeToSpend | null;
  financialPosition: FinancialPosition | null;
  insights: HouseholdInsights | null;
  loading?: boolean;
  onEditBuffer?: () => void;
  onOpenAccounts?: () => void;
}) {
  if (loading && !safeToSpend && !financialPosition) {
    return <div className="mb-6 h-80 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const deductions = safeToSpend?.status === 'ready'
    ? [
        safeToSpend.billsDue ? `${formatCurrency(safeToSpend.billsDue)} in upcoming bills` : null,
        safeToSpend.pendingOutflow ? `${formatCurrency(safeToSpend.pendingOutflow)} pending` : null,
        `${formatCurrency(safeToSpend.buffer)} buffer`,
      ].filter(Boolean)
    : [];

  return (
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-slate-600">Safe to spend</h2>
          {safeToSpend?.status === 'ready' && safeToSpend.amount != null ? (
            <>
              <p className="mt-1 tabular-nums text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                {formatCurrency(safeToSpend.amount)}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                After {deductions.join(', ')}.
              </p>
            </>
          ) : (
            <div className="mt-2 max-w-2xl">
              <p className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Safe to spend isn&apos;t available yet
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-700">
                {safeToSpend?.warning || 'Current account balances are needed before this amount can be calculated.'}
              </p>
            </div>
          )}
        </div>
        {onEditBuffer && (
          <button type="button" onClick={onEditBuffer} className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Adjust buffer
          </button>
        )}
      </div>

      <div className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
        <PositionRow label="Checking" value={financialPosition?.liquidChecking} onClick={onOpenAccounts} />
        <PositionRow label="Savings" value={financialPosition?.liquidSavings} onClick={onOpenAccounts} />
        <PositionRow label="Net worth" value={financialPosition?.estimatedNetWorth} onClick={onOpenAccounts} />
      </div>

      {insights && (
        <div className="divide-y divide-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-4">
            <div>
              <p className="text-sm font-medium text-slate-700">This week</p>
              <p className="mt-0.5 text-xs font-medium">{changeText(insights.weekly.spendingDifference, 'the same days last week')}</p>
            </div>
            <div className="text-right">
              <p className="tabular-nums text-lg font-semibold text-slate-950">{formatCurrency(insights.weekly.current.spending)}</p>
              {insights.weekly.pendingSpending > 0 && (
                <p className="tabular-nums text-xs text-amber-700">{formatCurrency(insights.weekly.pendingSpending)} pending</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-4">
            <div>
              <p className="text-sm font-medium text-slate-700">This month</p>
              <p className="mt-0.5 text-xs font-medium">{changeText(insights.monthly.spendingDifference, 'the same point last month')}</p>
            </div>
            <div className="text-right">
              <p className="tabular-nums text-lg font-semibold text-slate-950">{formatCurrency(insights.monthly.current.spending)}</p>
              <p className="tabular-nums text-xs text-slate-500">On pace for {formatCurrency(insights.forecast.projectedMonthEndSpending)}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
