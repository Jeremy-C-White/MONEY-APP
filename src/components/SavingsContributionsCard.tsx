import React, { useEffect, useState } from 'react';
import { Check, Pencil, PiggyBank, TrendingDown, X } from 'lucide-react';
import type {
  SavingsContributionsResponse,
  SavingsDestination,
} from '../types/finance';
import {
  formatCurrency,
  formatMonthLabel,
  formatPercentage,
  getContributionCadenceLabel,
} from '../lib/formatters';
import { extractSavingsContributions } from '../lib/api-contracts';

/** A 12-month sparkline of contribution amounts. Presentation only. */
function Sparkline({ history }: { history: SavingsDestination['monthlyHistory'] }) {
  const points = history.slice(-12);
  if (points.length < 2) return null;

  const amounts = points.map(point => point.amount);
  const highest = Math.max(...amounts);
  if (highest <= 0) return null;

  const width = 120;
  const height = 28;
  const step = width / (points.length - 1);
  const path = points
    .map((point, index) => {
      const x = index * step;
      const y = height - (point.amount / highest) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="flex-shrink-0 overflow-visible"
      role="img"
      aria-label={`Contributions over the last ${points.length} months with activity`}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Rendered as the body of a keyed <li> owned by the parent: this project has
// no @types/react, so `key` cannot be passed to a function component.
function DestinationRowBody({
  destination,
  onRename,
  renaming,
}: {
  destination: SavingsDestination;
  onRename: (destinationId: string, displayName: string) => Promise<void>;
  renaming: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(destination.displayName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(destination.displayName);
  }, [destination.displayName]);

  const ended = destination.status === 'ended';
  const stepDown = destination.rateChange;

  const submit = async () => {
    setError(null);
    try {
      await onRename(destination.destinationId, draft);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save that name.');
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Name for ${destination.key}`}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void submit();
                  if (event.key === 'Escape') setEditing(false);
                }}
                className="min-h-11 w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={renaming}
                aria-label="Save name"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); }}
                aria-label="Cancel rename"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-medium text-slate-900">
                {destination.displayName}
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={`Rename ${destination.displayName}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-indigo-600"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {!destination.isNamed && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  Name this
                </span>
              )}
            </div>
          )}
          {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}

          <p className="mt-1 text-sm text-slate-500">
            {formatCurrency(destination.totalContributed)} total ·{' '}
            {getContributionCadenceLabel(destination.cadence)} · since{' '}
            {formatMonthLabel(destination.firstContribution.slice(0, 7))}
          </p>

          {stepDown && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-amber-700">
              <TrendingDown className="h-4 w-4 flex-shrink-0" />
              was {formatCurrency(stepDown.previousAmount)} until{' '}
              {formatMonthLabel(stepDown.changedOnMonth)}, now{' '}
              {formatCurrency(stepDown.currentAmount)}
            </p>
          )}

          {destination.mergedStreamCount > 1 && (
            <p className="mt-1 text-xs text-slate-500">
              Combines {destination.mergedStreamCount} transfer streams sharing this
              description:{' '}
              {destination.streams
                .map(stream => `${formatCurrency(stream.typicalAmount)} ${getContributionCadenceLabel(stream.cadence)}`)
                .join(' and ')}
              .
            </p>
          )}

          {ended && (
            <p className="mt-1 text-sm text-slate-500">
              Ended {formatMonthLabel(destination.lastContribution.slice(0, 7))}
            </p>
          )}
          {destination.status === 'paused' && (
            <p className="mt-1 text-sm text-amber-700">
              Nothing since {formatMonthLabel(destination.lastContribution.slice(0, 7))}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-slate-300">
            <Sparkline history={destination.monthlyHistory} />
          </div>
          <div className="text-right">
            {destination.currentMonthlyRate == null ? (
              <span className="text-sm text-slate-400">No current rate</span>
            ) : (
              <>
                <span className="block text-lg font-semibold text-slate-900">
                  {formatCurrency(destination.currentMonthlyRate)}
                </span>
                <span className="text-xs text-slate-500">per month</span>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

export function SavingsContributionsCard({
  apiFetch,
  refreshKey,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey?: number;
}) {
  const [report, setReport] = useState<SavingsContributionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/savings/contributions');
      if (!response.ok) throw new Error('Failed to load savings contributions.');
      setReport(extractSavingsContributions(await response.json()));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load savings contributions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshKey]);

  const rename = async (destinationId: string, displayName: string) => {
    setRenaming(true);
    try {
      const response = await apiFetch(`/api/savings/destinations/${destinationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Could not save that name.');
      await load();
    } finally {
      setRenaming(false);
    }
  };

  if (loading && !report) {
    return <div className="mb-8 h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }

  if (error && !report) {
    return (
      <section className="mb-8 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-medium text-slate-900">Investment transfers</h3>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!report) return null;

  const { totals, destinations } = report;

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <PiggyBank className="h-5 w-5 text-slate-400" />
        <h3 className="text-lg font-medium text-slate-900">Investment transfers</h3>
      </div>

      {destinations.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No bank-to-investment transfers have been recorded yet.
        </p>
      ) : (
        <>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {totals.currentMonthlyRate == null
              ? formatCurrency(totals.monthlyAverage)
              : formatCurrency(totals.currentMonthlyRate)}
            <span className="ml-1 text-base font-medium text-slate-500">/ month</span>
            {/*
              The percentage appears only when recognized income is known. A
              null investment-funding rate renders as nothing, never as 0%.
            */}
            {totals.investmentFundingRateOfIncome != null && (
              <span className="ml-2 text-base font-medium text-emerald-600">
                {formatPercentage(totals.investmentFundingRateOfIncome)} of recognized income
              </span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {formatCurrency(totals.totalContributed)} across {totals.contributionCount}{' '}
            {totals.contributionCount === 1 ? 'transfer' : 'transfers'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Includes bank outflows identified as investment funding. Payroll 401k contributions
            and ordinary transfers between checking and savings are not included.
          </p>

          <ul className="mt-4">
            {destinations.map(destination => (
              <li
                key={destination.destinationId}
                className={`border-t border-slate-100 py-4 first:border-t-0 ${
                  destination.status === 'ended' ? 'opacity-60' : ''
                }`}
              >
                <DestinationRowBody
                  destination={destination}
                  onRename={rename}
                  renaming={renaming}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
