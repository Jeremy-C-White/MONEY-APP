import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { extractClassificationRulesResponse } from '../lib/api-contracts';
import { getCategoryLabel, getClassificationLabel } from '../lib/formatters';
import type { ClassificationRuleRecord } from '../types/finance';

export function ClassificationRulesCard({
  apiFetch,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}) {
  const [rules, setRules] = useState<ClassificationRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await apiFetch('/api/classification-rules');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Could not load remembered suggestions.');
        if (active) setRules(extractClassificationRulesResponse(payload));
      } catch (caught: unknown) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load remembered suggestions.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [apiFetch]);

  const deleteRule = async (ruleId: string) => {
    setDeletingRuleId(ruleId);
    setError('');
    try {
      const response = await apiFetch(`/api/classification-rules/${encodeURIComponent(ruleId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not delete this suggestion.');
      setRules(current => current.filter(rule => rule.ruleId !== ruleId));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not delete this suggestion.');
    } finally {
      setDeletingRuleId(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900">Remembered review suggestions</h3>
      <p className="mt-1 text-sm text-slate-500">
        These only prefill future reviews. They never change financial totals until you confirm a transaction.
      </p>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading suggestions...</p>}
      {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      {!loading && !error && rules.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No remembered suggestions yet.</p>
      )}

      {rules.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {rules.map(rule => (
            <div key={rule.ruleId} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold capitalize text-slate-900">{rule.merchantKey}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {getClassificationLabel(rule.classification)} · {rule.direction}
                  {rule.category ? ` · ${getCategoryLabel(rule.category)}` : ''}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Confirmed from this suggestion {rule.timesApplied} {rule.timesApplied === 1 ? 'time' : 'times'}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete suggestion for ${rule.merchantKey}`}
                disabled={deletingRuleId === rule.ruleId}
                onClick={() => void deleteRule(rule.ruleId)}
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
