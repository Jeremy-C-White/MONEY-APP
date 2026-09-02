import React, { useState } from 'react';
import { CalendarClock, Check, Pencil, RotateCcw } from 'lucide-react';
import type {
  LikelyRecurringObligation,
  RecurringObligationsResponse,
} from '../types/finance';
import {
  formatCurrency,
  formatFriendlyDate,
  formatMonthShort,
  getCategoryLabel,
} from '../lib/formatters';

const cadenceLabels = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type DecisionStatus = 'confirmed' | 'seasonal' | 'dismissed';

type Draft = {
  status: DecisionStatus;
  expectedMonthlyAmount: string;
  seasonStartMonth: number;
  seasonEndMonth: number;
  note: string;
};

function statusLabel(status: LikelyRecurringObligation['status']): string {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'seasonal') return 'Seasonal';
  if (status === 'dismissed') return 'Not recurring';
  return 'Needs review';
}

function statusClasses(status: LikelyRecurringObligation['status']): string {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'seasonal') return 'bg-sky-50 text-sky-700';
  if (status === 'dismissed') return 'bg-slate-200 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

export function RecurringObligationsCard({
  report,
  loading,
  apiFetch,
  onChanged,
}: {
  report: RecurringObligationsResponse | null;
  loading?: boolean;
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  onChanged: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading && !report) {
    return <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />;
  }

  const obligations = report?.obligations || [];

  const beginEditing = (
    obligation: LikelyRecurringObligation,
    requestedStatus?: DecisionStatus
  ) => {
    const existingStatus = obligation.status === 'suggested'
      ? 'confirmed'
      : obligation.status;
    setEditingId(obligation.obligationId);
    setDraft({
      status: requestedStatus || existingStatus,
      expectedMonthlyAmount: String(obligation.expectedMonthlyAmount),
      seasonStartMonth: obligation.seasonStartMonth || 3,
      seasonEndMonth: obligation.seasonEndMonth || 11,
      note: obligation.note || '',
    });
    setError(null);
  };

  const saveDecision = async (
    obligation: LikelyRecurringObligation,
    decision: Draft
  ) => {
    const expectedMonthlyAmount = Number(decision.expectedMonthlyAmount);
    if (!Number.isFinite(expectedMonthlyAmount) || expectedMonthlyAmount <= 0) {
      setError('Enter a monthly amount greater than zero.');
      return;
    }

    setSavingId(obligation.obligationId);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/recurring-obligations/${encodeURIComponent(obligation.obligationId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: decision.status,
            expectedMonthlyAmount,
            seasonStartMonth: decision.status === 'seasonal'
              ? decision.seasonStartMonth
              : null,
            seasonEndMonth: decision.status === 'seasonal'
              ? decision.seasonEndMonth
              : null,
            note: decision.note,
          }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to save this recurring service.');
      }
      setEditingId(null);
      setDraft(null);
      await onChanged();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this recurring service.');
    } finally {
      setSavingId(null);
    }
  };

  const saveQuickDecision = (
    obligation: LikelyRecurringObligation,
    status: 'confirmed' | 'dismissed'
  ) => saveDecision(obligation, {
    status,
    expectedMonthlyAmount: String(obligation.expectedMonthlyAmount),
    seasonStartMonth: 3,
    seasonEndMonth: 11,
    note: obligation.note || '',
  });

  const resetDecision = async (obligation: LikelyRecurringObligation) => {
    setSavingId(obligation.obligationId);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/recurring-obligations/${encodeURIComponent(obligation.obligationId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Unable to reset this recurring service.');
      }
      await onChanged();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset this recurring service.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <CalendarClock className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-medium text-slate-900">Recurring services</h3>
              {(report?.suggestionCount || 0) > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {report?.suggestionCount} to review
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Confirm real obligations, mark seasonal services, and dismiss spending habits.
              Planning choices never change your actual transaction totals.
            </p>
          </div>
        </div>

        <div className="lg:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Confirmed this month
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatCurrency(report?.confirmedMonthlyTotal ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Detector suggested {formatCurrency(report?.estimatedMonthlyTotal ?? 0)}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {(report?.forecast || []).length > 0 && (report?.confirmedMonthlyTotal || 0) > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Six-month confirmed forecast
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {report?.forecast.map(point => (
              <div key={point.month} className="rounded-lg bg-slate-50 px-2 py-3 text-center">
                <p className="text-[11px] font-medium text-slate-500">
                  {formatMonthShort(point.month)}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-900">
                  {formatCurrency(point.confirmedAmount)}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {point.obligationCount} {point.obligationCount === 1 ? 'service' : 'services'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {obligations.length === 0 ? (
        <div className="mt-6 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No stable recurring charges detected yet.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {obligations.map(obligation => {
            const isEditing = editingId === obligation.obligationId && draft;
            const isSaving = savingId === obligation.obligationId;
            return (
              <div
                key={obligation.obligationId}
                className={`rounded-xl border p-4 ${
                  obligation.status === 'dismissed'
                    ? 'border-slate-100 bg-slate-50 opacity-75'
                    : 'border-slate-100 bg-slate-50/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{obligation.merchant}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {getCategoryLabel(obligation.category)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClasses(obligation.status)}`}>
                    {statusLabel(obligation.status)}
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrency(obligation.expectedMonthlyAmount)}
                    <span className="ml-1 text-xs font-normal text-slate-400">/ month</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {cadenceLabels[obligation.cadence]} · typical charge{' '}
                    {formatCurrency(obligation.typicalCharge)}
                  </p>
                  {obligation.status === 'seasonal' && obligation.seasonStartMonth && obligation.seasonEndMonth && (
                    <p className="mt-1 text-xs font-medium text-sky-700">
                      Active {monthNames[obligation.seasonStartMonth - 1]}–{monthNames[obligation.seasonEndMonth - 1]}
                    </p>
                  )}
                </div>

                <p className="mt-3 text-[11px] text-slate-400">
                  {obligation.occurrenceCount} observed · last {formatFriendlyDate(obligation.lastChargeDate)}
                  {!obligation.detected && ' · no recent matching pattern'}
                </p>

                {isEditing && draft ? (
                  <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                    <label className="block text-xs font-medium text-slate-600">
                      Decision
                      <select
                        value={draft.status}
                        onChange={event => setDraft({
                          ...draft,
                          status: event.target.value as DecisionStatus,
                        })}
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      >
                        <option value="confirmed">Confirmed ongoing</option>
                        <option value="seasonal">Seasonal</option>
                        <option value="dismissed">Not recurring</option>
                      </select>
                    </label>

                    <label className="block text-xs font-medium text-slate-600">
                      Expected monthly amount
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={draft.expectedMonthlyAmount}
                        onChange={event => setDraft({ ...draft, expectedMonthlyAmount: event.target.value })}
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      />
                    </label>

                    {draft.status === 'seasonal' && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-xs font-medium text-slate-600">
                          Starts
                          <select
                            value={draft.seasonStartMonth}
                            onChange={event => setDraft({ ...draft, seasonStartMonth: Number(event.target.value) })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900"
                          >
                            {monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-slate-600">
                          Ends
                          <select
                            value={draft.seasonEndMonth}
                            onChange={event => setDraft({ ...draft, seasonEndMonth: Number(event.target.value) })}
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900"
                          >
                            {monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
                          </select>
                        </label>
                      </div>
                    )}

                    <label className="block text-xs font-medium text-slate-600">
                      Note (optional)
                      <input
                        maxLength={200}
                        value={draft.note}
                        onChange={event => setDraft({ ...draft, note: event.target.value })}
                        placeholder="Example: lawn care season"
                        className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                      />
                    </label>

                    <div className="flex gap-2">
                      <button
                        onClick={() => void saveDecision(obligation, draft)}
                        disabled={isSaving}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setDraft(null); setError(null); }}
                        disabled={isSaving}
                        className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : obligation.status === 'suggested' ? (
                  <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                    <button
                      onClick={() => void saveQuickDecision(obligation, 'confirmed')}
                      disabled={isSaving}
                      className="min-h-11 rounded-lg bg-emerald-600 px-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => beginEditing(obligation, 'seasonal')}
                      disabled={isSaving}
                      className="min-h-11 rounded-lg border border-sky-200 bg-sky-50 px-2 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                    >
                      Seasonal
                    </button>
                    <button
                      onClick={() => void saveQuickDecision(obligation, 'dismissed')}
                      disabled={isSaving}
                      className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Not recurring
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
                    <button
                      onClick={() => beginEditing(obligation)}
                      disabled={isSaving || !obligation.detected}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => void resetDecision(obligation)}
                      disabled={isSaving}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
