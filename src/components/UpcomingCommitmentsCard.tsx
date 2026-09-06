import React from 'react';
import { CalendarClock } from 'lucide-react';
import type { SafeToSpend } from '../types/finance';
import { formatCurrency } from '../lib/formatters';
import { describeThroughDate } from '../lib/verdict-language';

/**
 * The confirmed charges still due inside the safe-to-spend window. These are
 * the same obligations the figure above deducts, listed with their dates so
 * the owner can see what is coming rather than only what it costs.
 */
export function UpcomingCommitmentsCard({
  safeToSpend,
  loading,
  onReviewObligations,
}: {
  safeToSpend: SafeToSpend | null;
  loading?: boolean;
  onReviewObligations?: () => void;
}) {
  if (loading && !safeToSpend) {
    return <div className="mb-8 h-48 animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!safeToSpend) return null;

  const bills = safeToSpend.deductions.filter(deduction => deduction.kind === 'bill');
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0);
  const through = describeThroughDate(safeToSpend.throughDate);

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-medium text-slate-900">Still coming</h3>
        </div>
        {bills.length > 0 && (
          <span className="text-sm font-semibold text-slate-700">
            {formatCurrency(total)} through {through}
          </span>
        )}
      </div>

      {bills.length === 0 ? (
        <p className="text-sm text-slate-500">
          No confirmed recurring charges are due before {through}.
          {onReviewObligations && (
            <>
              {' '}
              <button
                type="button"
                onClick={onReviewObligations}
                className="font-medium text-indigo-600 underline transition-colors hover:text-indigo-800"
              >
                Review recurring obligations
              </button>
              {' '}to confirm the ones you expect.
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {bills.map(bill => (
            <li key={bill.deductionId} className="flex items-start justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{bill.label}</p>
                <p className="text-xs text-slate-500">
                  {bill.date ? describeThroughDate(bill.date) : 'Date unknown'}
                  {bill.accountName ? ` · ${bill.accountName}` : ''}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-slate-700">
                {formatCurrency(bill.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
