import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Tag, Trash2, X } from 'lucide-react';
import { extractMerchantLabelsResponse } from '../lib/api-contracts';
import type { MerchantLabelRuleRecord } from '../types/finance';

export function MerchantLabelsCard({
  apiFetch,
  onChanged,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  onChanged?: () => void;
}) {
  const [rules, setRules] = useState<MerchantLabelRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [nextLabel, setNextLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await apiFetch('/api/merchant-labels');
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Could not load household labels.');
        if (active) setRules(extractMerchantLabelsResponse(payload));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load household labels.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [apiFetch]);

  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; rules: MerchantLabelRuleRecord[] }>();
    for (const rule of rules) {
      const key = rule.label.toLowerCase();
      const group = grouped.get(key) || { label: rule.label, rules: [] };
      group.rules.push(rule);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [rules]);
  const suggestions = groups.map(group => group.label);

  const rename = async (currentLabel: string) => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch('/api/merchant-labels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentLabel, label: nextLabel }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not rename this household label.');
      const savedLabel = typeof payload?.label === 'string' ? payload.label : nextLabel.trim();
      setRules(current => current.map(rule => (
        rule.label.toLowerCase() === currentLabel.toLowerCase() ? { ...rule, label: savedLabel } : rule
      )));
      setEditingLabel(null);
      setNextLabel('');
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not rename this household label.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ruleId: string) => {
    setDeletingRuleId(ruleId);
    setError('');
    try {
      const response = await apiFetch(`/api/merchant-labels/${encodeURIComponent(ruleId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not remove this merchant label.');
      setRules(current => current.filter(rule => rule.ruleId !== ruleId));
      onChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this merchant label.');
    } finally {
      setDeletingRuleId(null);
    }
  };

  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><Tag className="h-4 w-4" /></span>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Household labels</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Keep names such as Preschool, Kids, and Eating out consistent. Renaming a label updates past and future reports for every merchant using it.
          </p>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500">Loading labels...</p>}
      {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No household labels yet. Add one from a posted transaction.</p>
      )}

      {groups.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {groups.map(group => (
            <div key={group.label.toLowerCase()} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {editingLabel === group.label ? (
                  <div className="flex min-w-0 flex-1 gap-2">
                    <input
                      value={nextLabel}
                      maxLength={40}
                      autoFocus
                      list="merchant-label-manager-suggestions"
                      onChange={event => setNextLabel(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter' && nextLabel.trim()) void rename(group.label); }}
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" aria-label={`Save ${group.label}`} disabled={saving || !nextLabel.trim()} onClick={() => void rename(group.label)} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-indigo-600 text-white disabled:opacity-50"><Check className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Cancel ${group.label}`} onClick={() => { setEditingLabel(null); setNextLabel(''); }} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-semibold text-slate-900">{group.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{group.rules.length} {group.rules.length === 1 ? 'merchant' : 'merchants'}</p>
                    </div>
                    <button type="button" aria-label={`Rename ${group.label} everywhere`} onClick={() => { setEditingLabel(group.label); setNextLabel(group.label); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
                      <Pencil className="h-3.5 w-3.5" /> Rename everywhere
                    </button>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.rules.map(rule => (
                  <span key={rule.ruleId} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs capitalize text-slate-600">
                    {rule.merchantKey}
                    <button type="button" aria-label={`Remove ${rule.merchantKey} from ${group.label}`} disabled={deletingRuleId === rule.ruleId} onClick={() => void remove(rule.ruleId)} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-50">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <datalist id="merchant-label-manager-suggestions">
        {suggestions.map(label => <option key={label.toLowerCase()} value={label} />)}
      </datalist>
    </section>
  );
}
