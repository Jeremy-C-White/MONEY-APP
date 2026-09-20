import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Landmark, Users } from 'lucide-react';
import { formatCurrency } from '../lib/formatters';
import type { CoverageReport } from '../types/finance';

type CoverageDrilldown = {
  classification?: string;
  startDate?: string;
  endDate?: string;
};

function MetricButton({
  icon,
  title,
  value,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-24 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
    >
      <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-600 group-hover:bg-white group-hover:text-indigo-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
        </span>
        <span className="mt-1 block text-lg font-bold text-slate-900">{value}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
    </button>
  );
}

export function CoverageCard({
  coverage,
  loading,
  onOpenLowConfidence,
  onViewTransactions,
  onOpenAccounts,
}: {
  coverage: CoverageReport | null;
  loading: boolean;
  onOpenLowConfidence: () => void;
  onViewTransactions: (filters: CoverageDrilldown) => void;
  onOpenAccounts: () => void;
}) {
  if (loading && !coverage) {
    return <div className="mb-8 h-52 animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />;
  }
  if (!coverage) return null;

  const dates = {
    startDate: coverage.period.startDate,
    endDate: coverage.period.endDate,
  };
  const lowCount = coverage.lowConfidence.transactionCount;
  const accountCount = coverage.accountIssues.accountCount;

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {lowCount + accountCount > 0
              ? <AlertTriangle className="h-5 w-5 text-amber-500" />
              : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            <h3 className="text-lg font-medium text-slate-900">How complete is the picture?</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            A quick check of the last 12 months. Card payments and person-to-person transfers are context, not extra spending.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricButton
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Plaid wasn't sure"
          value={lowCount === 0 ? 'All clear' : `${lowCount} ${lowCount === 1 ? 'purchase' : 'purchases'}`}
          detail={lowCount === 0
            ? 'No unlabeled low-confidence purchases.'
            : `${formatCurrency(coverage.lowConfidence.amount)} can be made clearer with household labels.`}
          onClick={onOpenLowConfidence}
        />
        <MetricButton
          icon={<Users className="h-4 w-4" />}
          title="Between people"
          value={formatCurrency(coverage.personToPerson.amount)}
          detail={`${coverage.personToPerson.transactionCount} outgoing payments with limited merchant detail.`}
          onClick={() => onViewTransactions({ ...dates, classification: 'person_to_person' })}
        />
        <MetricButton
          icon={<CreditCard className="h-4 w-4" />}
          title="Card payments"
          value={formatCurrency(coverage.cardPayments.amount)}
          detail={`${coverage.cardPayments.transactionCount} payment rows; linked card purchases provide the detail.`}
          onClick={() => onViewTransactions({ ...dates, classification: 'credit_card_payment' })}
        />
        <MetricButton
          icon={<Landmark className="h-4 w-4" />}
          title="Account freshness"
          value={accountCount === 0 ? 'All current' : `${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}`}
          detail={accountCount === 0
            ? 'Linked accounts are reporting normally.'
            : coverage.accountIssues.accounts.slice(0, 2).map(account => account.label).join(', ')}
          onClick={onOpenAccounts}
        />
      </div>
    </section>
  );
}
