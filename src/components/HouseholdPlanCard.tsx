import React, { useEffect, useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import type { HouseholdPlan } from '../types/finance';
import { formatCurrency } from '../lib/formatters';
import { extractHouseholdPlan } from '../lib/api-contracts';

function toField(value: number | null): string {
  return value == null ? '' : String(value);
}

/**
 * The two owner-set planning inputs. Neither is ever inferred: an empty
 * target field means "no target", not zero.
 */
export function HouseholdPlanCard({
  apiFetch,
  onSaved,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  onSaved?: (plan: HouseholdPlan) => void;
}) {
  const [plan, setPlan] = useState<HouseholdPlan | null>(null);
  const [buffer, setBuffer] = useState('');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch('/api/household-plan');
        if (!response.ok) throw new Error('Failed to load your plan.');
        const loaded = extractHouseholdPlan(await response.json());
        if (cancelled) return;
        setPlan(loaded);
        setBuffer(String(loaded.safeToSpendBuffer));
        setTarget(toField(loaded.monthlySpendingTarget));
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load your plan.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiFetch]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const trimmedBuffer = buffer.trim();
    const trimmedTarget = target.trim();
    const parsedBuffer = trimmedBuffer === '' ? 0 : Number(trimmedBuffer);
    const parsedTarget = trimmedTarget === '' ? null : Number(trimmedTarget);

    if (!Number.isFinite(parsedBuffer) || parsedBuffer < 0) {
      setError('The buffer must be zero or more.');
      setSaving(false);
      return;
    }
    if (parsedTarget !== null && (!Number.isFinite(parsedTarget) || parsedTarget <= 0)) {
      setError('A monthly target must be greater than zero, or left blank.');
      setSaving(false);
      return;
    }

    try {
      const response = await apiFetch('/api/household-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeToSpendBuffer: parsedBuffer,
          monthlySpendingTarget: parsedTarget,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Failed to save your plan.');
      const savedPlan = extractHouseholdPlan(payload);
      setPlan(savedPlan);
      setBuffer(String(savedPlan.safeToSpendBuffer));
      setTarget(toField(savedPlan.monthlySpendingTarget));
      setSaved(true);
      onSaved?.(savedPlan);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save your plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="household-plan"
      className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
    >
      <div className="mb-1 flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-slate-400" />
        <h3 className="text-lg font-medium text-slate-900">Your plan</h3>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Both are your call. FinSync never guesses either one.
      </p>

      {loading ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-5">
          <div>
            <label
              htmlFor="safe-to-spend-buffer"
              className="block text-sm font-medium text-slate-700"
            >
              Safe-to-spend buffer
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Cash held back from the safe-to-spend figure.
            </p>
            <input
              id="safe-to-spend-buffer"
              type="number"
              min="0"
              step="10"
              inputMode="decimal"
              value={buffer}
              onChange={event => { setBuffer(event.target.value); setSaved(false); }}
              className="min-h-11 w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label
              htmlFor="monthly-spending-target"
              className="block text-sm font-medium text-slate-700"
            >
              Monthly spending target
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Leave blank for no target. Without one, FinSync can only say whether
              spending is higher or lower than last month — not whether that is fine.
            </p>
            <input
              id="monthly-spending-target"
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              placeholder="No target"
              value={target}
              onChange={event => { setTarget(event.target.value); setSaved(false); }}
              className="min-h-11 w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save plan'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
            {plan && (
              <span className="text-sm text-slate-500">
                Buffer {formatCurrency(plan.safeToSpendBuffer)} · Target{' '}
                {plan.monthlySpendingTarget == null
                  ? 'none'
                  : formatCurrency(plan.monthlySpendingTarget)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
