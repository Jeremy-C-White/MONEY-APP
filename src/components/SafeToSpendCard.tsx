import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Wallet } from 'lucide-react';
import type { SafeToSpend, SafeToSpendDeduction } from '../types/finance';
import { formatCurrency } from '../lib/formatters';
import { describeSafeToSpend, describeThroughDate } from '../lib/verdict-language';

const DEDUCTION_HEADINGS: Record<SafeToSpendDeduction['kind'], string> = {
  bill: 'Bill due',
  pending: 'Pending charge',
  buffer: 'Your buffer',
};

function deductionCaption(deduction: SafeToSpendDeduction): string {
  return [
    DEDUCTION_HEADINGS[deduction.kind],
    deduction.date ? describeThroughDate(deduction.date) : null,
    deduction.accountName,
  ].filter(Boolean).join(' · ');
}

export function SafeToSpendCard({
  safeToSpend,
  loading,
  onEditBuffer,
}: {
  safeToSpend: SafeToSpend | null;
  loading?: boolean;
  onEditBuffer?: () => void;
}) {
  const [showDeductions, setShowDeductions] = useState(false);

  if (loading && !safeToSpend) {
    return <div className="mb-8 h-56 animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!safeToSpend) return null;

  const explanation = describeSafeToSpend(safeToSpend);

  // A figure the server withheld is never approximated here. The owner sees
  // why it is missing instead of a number they might act on.
  if (safeToSpend.status !== 'ready') {
    return (
      <section className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <h3 className="text-lg font-semibold text-amber-900">
              Safe to spend is unavailable
            </h3>
            <p className="mt-1 text-sm text-amber-800">{explanation}</p>
            {safeToSpend.unassignedCashAccountCount > 0 && (
              <p className="mt-2 text-xs font-medium text-amber-800">
                {safeToSpend.unassignedCashAccountCount}{' '}
                {safeToSpend.unassignedCashAccountCount === 1 ? 'cash account needs' : 'cash accounts need'}{' '}
                a confirmed role before this figure can be shown.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const negative = (safeToSpend.amount ?? 0) < 0;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="p-6 md:p-8">
        <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          <Wallet className="h-4 w-4" />
          Safe to spend
        </div>

        <p
          className={`mt-3 text-5xl font-bold tracking-tight md:text-6xl ${
            negative ? 'text-rose-600' : 'text-slate-900'
          }`}
        >
          {formatCurrency(safeToSpend.amount)}
        </p>

        <p className="mt-3 max-w-2xl text-sm text-slate-600">{explanation}</p>

        {negative && (
          <p className="mt-2 max-w-2xl text-sm font-medium text-rose-600">
            Known commitments through {describeThroughDate(safeToSpend.throughDate)} exceed
            the cash on hand.
          </p>
        )}

        {safeToSpend.pendingReflectedInBalance && (
          <p className="mt-2 text-xs text-slate-500">
            Cash uses each account's available balance, which already withholds pending
            charges on those accounts.
          </p>
        )}

        <p className="mt-2 text-xs text-slate-500">
          Expected income before {describeThroughDate(safeToSpend.throughDate)} is not counted.
        </p>

        <p className="mt-2 text-xs text-slate-500">
          Uses {safeToSpend.cashAccountCount}{' '}
          {safeToSpend.cashAccountCount === 1 ? 'operating account' : 'operating accounts'}.
          {safeToSpend.excludedCashAccountCount > 0
            ? ` ${safeToSpend.excludedCashAccountCount} non-operating cash ${safeToSpend.excludedCashAccountCount === 1 ? 'account is' : 'accounts are'} excluded.`
            : ''}
        </p>
        {safeToSpend.unassignedCashAccountCount > 0 && (
          <p className="mt-1 text-xs font-medium text-amber-700">
            {safeToSpend.unassignedCashAccountCount}{' '}
            {safeToSpend.unassignedCashAccountCount === 1 ? 'cash account needs' : 'cash accounts need'}{' '}
            a confirmed role and is not included.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDeductions(current => !current)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            aria-expanded={showDeductions}
          >
            {showDeductions ? 'Hide the math' : 'Show the math'}
            {showDeductions ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {onEditBuffer && (
            <button
              type="button"
              onClick={onEditBuffer}
              className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800"
            >
              {safeToSpend.buffer ? 'Change your buffer' : 'Set a buffer'}
            </button>
          )}
        </div>
      </div>

      {showDeductions && (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-5 md:px-8">
          <dl className="mb-3 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-600">
                Cash across {safeToSpend.cashAccountCount}{' '}
                {safeToSpend.cashAccountCount === 1 ? 'operating account' : 'operating accounts'}
              </dt>
              <dd className="font-semibold text-slate-900">
                {formatCurrency(safeToSpend.cashOnHand)}
              </dd>
            </div>
          </dl>

          {safeToSpend.deductions.length ? (
            <ul className="rounded-xl border border-slate-200 bg-white px-4">
              {safeToSpend.deductions.map(deduction => (
                <li
                  key={deduction.deductionId}
                  className="flex items-start justify-between gap-4 border-t border-slate-100 py-2.5 first:border-t-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {deduction.label}
                    </p>
                    <p className="text-xs text-slate-500">{deductionCaption(deduction)}</p>
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-700">
                    −{formatCurrency(deduction.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              Nothing is committed before {describeThroughDate(safeToSpend.throughDate)}.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-sm font-medium text-slate-700">Safe to spend</span>
            <span
              className={`text-base font-bold ${negative ? 'text-rose-600' : 'text-slate-900'}`}
            >
              {formatCurrency(safeToSpend.amount)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
