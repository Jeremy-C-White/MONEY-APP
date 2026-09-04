import React from 'react';
import { AlertCircle, Clock3 } from 'lucide-react';
import { formatCurrency } from '../lib/formatters';
import type { AccountBalanceSummary } from '../types/finance';
import { MetricCard } from './MetricCard';

function formatBalanceTime(value: string | null): string {
  if (!value) return 'Not available yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available yet';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AccountPositionCards({
  balances,
  spending,
  spendingSubtitle,
  projectedMonthEndSpending,
  loading,
}: {
  balances: AccountBalanceSummary | null;
  spending: number | null | undefined;
  spendingSubtitle: React.ReactNode;
  projectedMonthEndSpending: number | null | undefined;
  loading?: boolean;
}) {
  const awaiting = Boolean(loading && !balances);
  const missing = !balances || balances.status === 'unavailable';
  const partial = balances?.status === 'partial';

  return (
    <section className="mb-8" aria-label="Household position">
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${
        missing
          ? 'border-indigo-100 bg-indigo-50 text-indigo-800'
          : partial
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-100 bg-white text-slate-600'
      }`}>
        {partial ? (
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
        ) : (
          <Clock3 className="mt-0.5 h-5 w-5 flex-shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold">
            {awaiting
              ? 'Loading your connected-account position…'
              : missing && balances?.reportingItemCount
                ? 'Plaid has not supplied enough current balance data to calculate your position.'
                : missing
                  ? 'Account balances will appear after your next successful sync.'
              : partial
                ? 'Showing known balances. Some account data is missing, stale, or cannot be combined.'
                : 'Connected-account position'}
          </p>
          {balances?.oldestFetchedAt && (
            <p className="mt-0.5 text-xs opacity-80">
              Updated from your bank sync {formatBalanceTime(balances.oldestFetchedAt)}
              {balances.status === 'partial'
                ? ` · ${balances.reportingItemCount} of ${balances.connectedItemCount} connections reporting`
                : ''}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Cash in accounts"
          value={formatCurrency(balances?.cashCurrent)}
          subtitle={
            <div className="space-y-1">
              <div>Available now: {formatCurrency(balances?.cashAvailable)}</div>
              <div>Connected position: {formatCurrency(balances?.connectedPosition)}</div>
            </div>
          }
          loading={loading && !balances}
          highlight
        />
        <MetricCard
          title="Card balances owed"
          value={formatCurrency(balances?.creditOwed)}
          subtitle={balances?.creditCredits
            ? `Card credits: ${formatCurrency(balances.creditCredits)}`
            : 'Positive card balances are amounts owed'}
          loading={loading && !balances}
        />
        <MetricCard
          title="Spending this month"
          value={formatCurrency(spending)}
          subtitle={spendingSubtitle}
          loading={loading}
        />
        <MetricCard
          title="Projected month-end"
          value={formatCurrency(projectedMonthEndSpending)}
          subtitle="Posted + pending + expected recurring + variable pace"
          loading={loading}
        />
      </div>
    </section>
  );
}
