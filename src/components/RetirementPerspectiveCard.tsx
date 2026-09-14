import React from 'react';
import { TrendingUp } from 'lucide-react';
import { formatCurrency, formatFriendlyDate, formatPercentage } from '../lib/formatters';
import type { FinancialPosition } from '../types/finance';

export function RetirementPerspectiveCard({ position }: { position: FinancialPosition }) {
  const retirement = position.retirement;
  if (retirement.accountCount === 0) return null;

  return (
    <section aria-label="Retirement perspective" className="mb-7 rounded-3xl border border-violet-100 bg-violet-50/60 p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100">
          <TrendingUp className="h-5 w-5 text-violet-700" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">Retirement perspective</h2>
          <p className="mt-1 text-xs text-slate-600">
            Long-term retirement assets are shown separately from liquid savings and never enter Safe to Spend.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retirement assets</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(retirement.total)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {retirement.knownBalanceCount}/{retirement.accountCount} balances included
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Share of net worth</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatPercentage(retirement.shareOfNetWorth)}</p>
          <p className="mt-1 text-xs text-slate-500">Based on known linked and manual balances</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded trend</p>
          <p className={`mt-1 text-xl font-bold ${retirement.trend && retirement.trend.change < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {retirement.trend
              ? `${retirement.trend.change >= 0 ? '+' : ''}${formatCurrency(retirement.trend.change)}`
              : 'Not enough history'}
          </p>
          {retirement.trend && (
            <p className="mt-1 text-xs text-slate-500">
              {formatFriendlyDate(retirement.trend.startDate)} to {formatFriendlyDate(retirement.trend.endDate)}
              {retirement.trend.percentageChange !== null
                ? ` · ${formatPercentage(retirement.trend.percentageChange)}`
                : ''}
            </p>
          )}
        </div>
      </div>

      {!retirement.contributionDataAvailable && (
        <p className="mt-4 text-xs text-violet-800">
          Contribution amounts are not available from the current balance feed. Balance growth can include market movement, so it is not labeled as contributions.
        </p>
      )}
    </section>
  );
}
