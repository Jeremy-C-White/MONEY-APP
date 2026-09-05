import React, { useState } from 'react';
import type { Transaction } from '../types/finance';
import { getCategoryLabel } from '../lib/formatters';
import { buildMerchantKeyForTransaction } from '../../server/lib/merchant-prefix';

type ReviewClassification = 'income' | 'spending' | 'refund' | 'internal_transfer';

const REVIEW_OPTIONS: Array<{ value: ReviewClassification; label: string }> = [
  { value: 'income', label: 'Income' },
  { value: 'spending', label: 'Spending' },
  { value: 'refund', label: 'Reimbursement' },
  { value: 'internal_transfer', label: 'Transfer between our accounts' },
];

export function TransactionOverrideActions({
  transaction,
  categories,
  reviewable,
  apiFetch,
  onChanged,
}: {
  transaction: Transaction;
  categories: Array<{ category: string }>;
  reviewable: boolean;
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [classification, setClassification] = useState<ReviewClassification | ''>('');
  const [offsetCategory, setOffsetCategory] = useState('');
  const [note, setNote] = useState('');
  const [rememberRule, setRememberRule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetEditor = () => {
    setEditing(false);
    setClassification('');
    setOffsetCategory('');
    setNote('');
    setRememberRule(false);
  };

  const beginEditing = () => {
    const suggestion = transaction.classificationSuggestion;
    setClassification(suggestion?.classification || '');
    setOffsetCategory(suggestion?.offsetCategory || '');
    setRememberRule(false);
    setEditing(true);
  };

  const save = async ({
    selectedClassification = classification,
    selectedOffsetCategory = offsetCategory,
    suggestionRuleId = null,
  }: {
    selectedClassification?: ReviewClassification | '';
    selectedOffsetCategory?: string;
    suggestionRuleId?: string | null;
  } = {}) => {
    if (!selectedClassification) {
      setEditing(false);
      return;
    }
    if (selectedClassification === 'refund' && !selectedOffsetCategory) {
      setError('Choose the category this reimbursement offsets.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/transactions/${encodeURIComponent(transaction.transactionId)}/override`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classification: selectedClassification,
            offsetCategory: selectedClassification === 'refund' ? selectedOffsetCategory : null,
            note: note || null,
            ...(rememberRule ? { rememberRule: true } : {}),
            ...(suggestionRuleId ? { suggestionRuleId } : {}),
          }),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Could not save this review.');
      }
      resetEditor();
      await onChanged();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not save this review.');
    } finally {
      setSaving(false);
    }
  };

  const undo = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/transactions/${encodeURIComponent(transaction.transactionId)}/override`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Could not undo this review.');
      }
      await onChanged();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not undo this review.');
    } finally {
      setSaving(false);
    }
  };

  if (transaction.isOverridden) {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700"
            title={transaction.overrideNote || 'Manually reviewed'}
          >
            Reviewed
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void undo()}
            className="text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-50"
          >
            {saving ? 'Undoing…' : 'Undo'}
          </button>
        </div>
        {transaction.overrideNote && (
          <p className="text-xs text-slate-500">{transaction.overrideNote}</p>
        )}
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </div>
    );
  }

  if (!reviewable) return null;

  if (!editing) {
    if (transaction.classificationSuggestion) {
      const suggestion = transaction.classificationSuggestion;
      const suggestionLabel = REVIEW_OPTIONS.find(option => option.value === suggestion.classification)?.label;
      return (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs">
          <p className="font-semibold text-sky-800">Suggested from a past decision</p>
          <p className="mt-0.5 text-slate-600">Suggested: {suggestionLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save({
                selectedClassification: suggestion.classification,
                selectedOffsetCategory: suggestion.offsetCategory || '',
                suggestionRuleId: suggestion.ruleId,
              })}
              className="rounded-lg bg-sky-700 px-3 py-1.5 font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {saving ? 'Confirming...' : 'Confirm suggestion'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={beginEditing}
              className="rounded-lg px-3 py-1.5 font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
            >
              Change
            </button>
          </div>
          {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={beginEditing}
        className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
      >
        Review
      </button>
    );
  }

  const rememberMerchantKey = buildMerchantKeyForTransaction(transaction);

  return (
    <div className="mt-3 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 space-y-3">
      <label className="block text-xs font-semibold text-slate-700">
        What is this transaction?
        <select
          aria-label="Review classification"
          value={classification}
          onChange={event => {
            setClassification(event.target.value as ReviewClassification | '');
            setError('');
          }}
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
        >
          <option value="">Still unsure</option>
          {REVIEW_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {(transaction.classification === 'other' || transaction.classification === 'unclassified_deposit') &&
        !transaction.classificationSuggestion && (
          rememberMerchantKey ? (
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={rememberRule}
                onChange={event => setRememberRule(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>
                Remember this for future <strong>{rememberMerchantKey}</strong> transactions.
                Suggestions still require confirmation.
              </span>
            </label>
          ) : (
            <p className="text-xs text-slate-400">
              This description doesn&apos;t have a stable merchant name, so it can&apos;t be remembered for future transactions.
            </p>
          )
        )}

      {classification === 'refund' && (
        <label className="block text-xs font-semibold text-slate-700">
          Category this reimbursement offsets
          <select
            aria-label="Reimbursement category"
            value={offsetCategory}
            onChange={event => setOffsetCategory(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="">Choose a category</option>
            {categories.map(category => (
              <option key={category.category} value={category.category}>
                {getCategoryLabel(category.category)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-xs font-semibold text-slate-700">
        Optional note
        <textarea
          aria-label="Override note"
          maxLength={500}
          value={note}
          onChange={event => setNote(event.target.value)}
          rows={2}
          className="mt-1 block w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"
        />
      </label>

      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="min-h-11 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : classification ? 'Save review' : 'Leave for later'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            resetEditor();
            setError('');
          }}
          className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
