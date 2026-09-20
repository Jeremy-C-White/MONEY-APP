import React from 'react';
import { Landmark, PiggyBank, ShieldCheck, WalletCards } from 'lucide-react';
import type { FinancialPosition, HouseholdInsights, SafeToSpend } from '../types/finance';
import { formatCurrency, formatFriendlyDate } from '../lib/formatters';

function PositionValue({ label, value, icon, description }: {
  label: string;
  value: number | null | undefined;
  icon: React.ReactNode;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}{label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {value == null ? '—' : formatCurrency(value)}
      </p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

export function OverviewNowCard({
  safeToSpend,
  financialPosition,
  insights,
  loading,
  onEditBuffer,
}: {
  safeToSpend: SafeToSpend | null;
  financialPosition: FinancialPosition | null;
  insights: HouseholdInsights | null;
  loading?: boolean;
  onEditBuffer?: () => void;
}) {
  if (loading && !safeToSpend && !financialPosition) {
    return <div className="mb-8 h-56 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const breakdown = financialPosition?.breakdown;
  const breakdownItems = [
    { label: 'Cash & savings', value: breakdown?.cashAndSavings, tone: 'text-emerald-700' },
    { label: 'Investments & retirement', value: breakdown?.investmentsAndRetirement, tone: 'text-sky-700' },
    { label: 'Homes & vehicles', value: breakdown?.propertyAndVehicles, tone: 'text-violet-700' },
  ].filter(item => item.value !== null && item.value !== undefined && item.value > 0);
  const liabilities = breakdown?.liabilities;
  const completeHistory = financialPosition?.netWorthHistory.filter(point => (
    point.status === 'complete' && point.estimatedNetWorth !== null
  )) || [];
  const latest = completeHistory[completeHistory.length - 1];
  const previous = completeHistory[completeHistory.length - 2];
  const snapshotChange = latest && previous && latest.date !== previous.date
    ? (latest.estimatedNetWorth as number) - (previous.estimatedNetWorth as number)
    : null;

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Now</p>
          <h3 className="mt-1 text-lg font-medium text-slate-900">Your current position</h3>
        </div>
        {onEditBuffer && (
          <button type="button" onClick={onEditBuffer} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Adjust buffer
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PositionValue label="Safe to spend" value={safeToSpend?.status === 'ready' ? safeToSpend.amount : null} icon={<ShieldCheck className="h-4 w-4" />} description="After upcoming bills and your chosen buffer" />
        <PositionValue label="Checking" value={financialPosition?.liquidChecking} icon={<WalletCards className="h-4 w-4" />} description="Current linked checking balances" />
        <PositionValue label="Savings" value={financialPosition?.liquidSavings} icon={<PiggyBank className="h-4 w-4" />} description="Cash set aside outside checking" />
        <PositionValue label="Estimated net worth" value={financialPosition?.estimatedNetWorth} icon={<Landmark className="h-4 w-4" />} description="Cash, investments, and property combined" />
      </div>
      {safeToSpend?.status === 'unavailable' && (
        <p className="mt-3 text-sm text-amber-700">Safe to spend is unavailable. {safeToSpend.warning}</p>
      )}
      {financialPosition?.liquidCash != null && (
        <p className="mt-3 text-xs text-slate-500">
          Checking and savings total {formatCurrency(financialPosition.liquidCash)} in liquid cash. Retirement stays separate.
        </p>
      )}
      {insights && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">This week</p>
            <p className={`text-xs font-semibold ${insights.weekly.spendingDifference > 0 ? 'text-rose-600' : insights.weekly.spendingDifference < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
              {insights.weekly.spendingDifference === 0
                ? 'Level with the same days last week'
                : `${formatCurrency(Math.abs(insights.weekly.spendingDifference))} ${insights.weekly.spendingDifference > 0 ? 'more' : 'less'} than the same days last week`}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <p className="text-xl font-semibold text-slate-950">{formatCurrency(insights.weekly.current.spending)} <span className="text-xs font-normal text-slate-500">posted spending</span></p>
            {insights.weekly.pendingSpending > 0 && (
              <p className="text-sm font-medium text-amber-700">{formatCurrency(insights.weekly.pendingSpending)} pending</p>
            )}
          </div>
        </div>
      )}
      {(breakdownItems.length > 0 || (liabilities !== null && liabilities !== undefined && liabilities > 0)) && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Net worth breakdown</p>
            {snapshotChange !== null && previous && (
              <p className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                snapshotChange > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : snapshotChange < 0
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
              }`}>
                {snapshotChange > 0 ? 'Up ' : snapshotChange < 0 ? 'Down ' : 'No change '}
                {snapshotChange !== 0 && formatCurrency(Math.abs(snapshotChange))}
                {' since '}{formatFriendlyDate(previous.date)}
              </p>
            )}
          </div>
          <div className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 ${
            liabilities !== null && liabilities !== undefined && liabilities > 0
              ? 'lg:grid-cols-4'
              : 'lg:grid-cols-3'
          }`}>
            {breakdownItems.map(item => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 sm:block">
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className={`text-sm font-semibold sm:mt-1 ${item.tone}`}>{formatCurrency(item.value)}</p>
              </div>
            ))}
            {liabilities !== null && liabilities !== undefined && liabilities > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2 sm:block">
                <p className="text-xs font-medium text-rose-600">Credit balances</p>
                <p className="text-sm font-semibold text-rose-700 sm:mt-1">-{formatCurrency(liabilities)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
