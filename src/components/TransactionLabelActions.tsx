import React, { useEffect, useState } from 'react';
import { Check, Pencil, Tag, Trash2, X } from 'lucide-react';
import type { Transaction } from '../types/finance';

export function TransactionLabelActions({
  transaction,
  apiFetch,
  onChanged,
  suggestions = [],
}: {
  transaction: Transaction;
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  onChanged: () => void | Promise<void>;
  suggestions?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(transaction.householdLabel || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLabel(transaction.householdLabel || '');
    setEditing(false);
    setError('');
  }, [transaction.transactionId, transaction.householdLabel]);

  if (!transaction.merchantKey || transaction.pending || transaction.removed) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/transactions/${encodeURIComponent(transaction.transactionId)}/merchant-label`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not save this label.');
      setEditing(false);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this label.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/transactions/${encodeURIComponent(transaction.transactionId)}/merchant-label`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not remove this label.');
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this label.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="mt-2">
        {transaction.householdLabel ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              <Tag className="h-3 w-3" /> Household: {transaction.householdLabel}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-700">
              <Pencil className="h-3 w-3" /> Edit
            </button>
            <button type="button" disabled={saving} onClick={() => void remove()} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800"
          >
            <Tag className="h-3.5 w-3.5" /> Add household label
          </button>
        )}
        {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-md rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
      <label className="block text-xs font-semibold text-slate-700" htmlFor={`label-${transaction.transactionId}`}>Household label</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`label-${transaction.transactionId}`}
          value={label}
          maxLength={40}
          autoFocus
          placeholder="For example: Preschool or Kids"
          list={`label-suggestions-${transaction.transactionId}`}
          onChange={event => setLabel(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void save(); }}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="button" disabled={saving || !label.trim()} onClick={() => void save()} aria-label="Save household label" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" disabled={saving} onClick={() => { setEditing(false); setLabel(transaction.householdLabel || ''); setError(''); }} aria-label="Cancel household label" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        Updates past and future reports for this merchant. Plaid's category stays underneath.
      </p>
      <datalist id={`label-suggestions-${transaction.transactionId}`}>
        {suggestions.map(suggestion => <option key={suggestion.toLowerCase()} value={suggestion} />)}
      </datalist>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
