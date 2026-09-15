import React from 'react';
import { Landmark, ShieldCheck, WalletCards } from 'lucide-react';
import type { FinancialPosition, SafeToSpend } from '../types/finance';
import { formatCurrency } from '../lib/formatters';

function PositionValue({ label, value, icon }: {
  label: string;
  value: number | null | undefined;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}{label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {value == null ? '—' : formatCurrency(value)}
      </p>
    </div>
  );
}

export function OverviewNowCard({
  safeToSpend,
  financialPosition,
  loading,
  onEditBuffer,
}: {
  safeToSpend: SafeToSpend | null;
  financialPosition: FinancialPosition | null;
  loading?: boolean;
  onEditBuffer?: () => void;
}) {
  if (loading && !safeToSpend && !financialPosition) {
    return <div className="mb-8 h-56 animate-pulse rounded-2xl bg-slate-100" />;
  }

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PositionValue label="Safe to spend" value={safeToSpend?.status === 'ready' ? safeToSpend.amount : null} icon={<ShieldCheck className="h-4 w-4" />} />
        <PositionValue label="Estimated net worth" value={financialPosition?.estimatedNetWorth} icon={<Landmark className="h-4 w-4" />} />
        <PositionValue label="Liquid cash" value={financialPosition?.liquidCash} icon={<WalletCards className="h-4 w-4" />} />
      </div>
      {safeToSpend?.status === 'unavailable' && (
        <p className="mt-3 text-sm text-amber-700">Safe to spend is unavailable. {safeToSpend.warning}</p>
      )}
      {financialPosition?.liquidSavings != null && (
        <p className="mt-3 text-xs text-slate-500">
          Liquid cash includes {formatCurrency(financialPosition.liquidSavings)} in savings. Retirement stays separate from this amount.
        </p>
      )}
    </section>
  );
}
