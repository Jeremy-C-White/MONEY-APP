import React from 'react';
import { Store } from 'lucide-react';
import type { MerchantComparisonReport } from '../types/finance';
import { formatCurrency } from '../lib/formatters';

function ComparisonNote({ previous, difference, isNew }: {
  previous: number;
  difference: number;
  isNew: boolean;
}) {
  if (isNew) return <span className="font-medium text-indigo-600">New this month</span>;
  if (difference === 0) return <span>Same as {formatCurrency(previous)} last month</span>;
  return (
    <span className={difference > 0 ? 'text-rose-600' : 'text-emerald-600'}>
      {difference > 0 ? 'Up' : 'Down'} from {formatCurrency(previous)} last month
    </span>
  );
}

export function TopMerchantsCard({ report }: { report: MerchantComparisonReport | null }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Store className="h-5 w-5 text-indigo-600" />
        <div>
          <h3 className="text-lg font-medium text-slate-900">Top merchants</h3>
          <p className="text-xs text-slate-500">Month to date compared with the same days last month</p>
        </div>
      </div>
      {!report?.merchants.length ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-slate-100 text-sm text-slate-400">No merchant spending yet this month</div>
      ) : (
        <ol className="divide-y divide-slate-100">
          {report.merchants.map((merchant, index) => (
            <li key={merchant.merchant} className="flex items-center gap-3 py-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{merchant.merchant}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <ComparisonNote previous={merchant.previousSpending} difference={merchant.difference} isNew={merchant.isNew} />
                  {' · '}{merchant.transactionCount} {merchant.transactionCount === 1 ? 'purchase' : 'purchases'}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-slate-900">{formatCurrency(merchant.currentSpending)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
