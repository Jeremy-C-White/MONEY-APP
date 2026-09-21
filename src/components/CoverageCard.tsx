import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../lib/formatters';
import type { CoverageReport } from '../types/finance';

type CoverageDrilldown = { classification?: string; startDate?: string; endDate?: string };

export function CoverageCard({ coverage, loading, onViewTransactions, onOpenAccounts }: {
  coverage: CoverageReport | null;
  loading: boolean;
  onViewTransactions: (filters: CoverageDrilldown) => void;
  onOpenAccounts: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (loading && !coverage) return <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />;
  if (!coverage) return null;

  const dates = { startDate: coverage.period.startDate, endDate: coverage.period.endDate };
  const cardCount = coverage.cardPayments.payees.length;
  const accountCount = coverage.accountIssues.accountCount;
  const hasGap = cardCount > 0 || accountCount > 0;
  const summary = [
    cardCount > 0 ? `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} without purchase detail` : null,
    accountCount > 0 ? `${accountCount} ${accountCount === 1 ? 'account needs' : 'accounts need'} attention` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="rounded-2xl bg-white px-5 shadow-sm md:px-7">
      <button type="button" onClick={() => setExpanded(value => !value)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${hasGap ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800">Coverage</span>
          <span className={`mt-0.5 block text-xs ${hasGap ? 'text-amber-700' : 'text-slate-500'}`}>{hasGap ? summary : 'Linked accounts are reporting normally.'}</span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {expanded && (
        <div className="divide-y divide-slate-100 border-t border-slate-100 pb-3">
          <CoverageRow label="Between people" detail={`${coverage.personToPerson.transactionCount} outgoing payments with limited merchant detail`} value={formatCurrency(coverage.personToPerson.amount)} onClick={() => onViewTransactions({ ...dates, classification: 'person_to_person' })} />
          <CoverageRow label="Card purchases not visible" detail={coverage.cardPayments.amount > 0 ? coverage.cardPayments.payees.join(', ') : 'Every card-payment payee has a linked-card match.'} value={coverage.cardPayments.amount > 0 ? `At least ${formatCurrency(coverage.cardPayments.amount)}` : 'All linked'} onClick={() => onViewTransactions({ ...dates, classification: 'credit_card_payment' })} />
          <CoverageRow label="Account freshness" detail={accountCount > 0 ? coverage.accountIssues.accounts.map(account => account.label).join(', ') : 'All linked accounts are current.'} value={accountCount > 0 ? `${accountCount} need attention` : 'All current'} onClick={onOpenAccounts} />
          {coverage.cardPaymentsBeforeHistory.amount > 0 && <p className="py-3 text-xs leading-5 text-slate-500">{formatCurrency(coverage.cardPaymentsBeforeHistory.amount)} in earlier payments happened before linked-card history began and is not counted above.</p>}
        </div>
      )}
    </section>
  );
}

function CoverageRow({ label, detail, value, onClick }: { label: string; detail: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-700">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span>
      <span className="tabular-nums text-sm font-semibold text-slate-950">{value}</span>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </button>
  );
}
