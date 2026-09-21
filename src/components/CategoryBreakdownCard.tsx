import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { extractSpendingBreakdownResponse } from '../lib/api-contracts';
import { formatCurrency, getCategoryLabel, getMerchantDisplayLabel } from '../lib/formatters';
import type { SpendingBreakdownReport, WalmartInsightPeriod } from '../types/finance';

export type SpendingDrilldown = {
  category?: string;
  householdLabel?: string;
  merchantFamily?: string;
  classification?: string;
  startDate?: string;
  endDate?: string;
};

function ComparisonNote({ previous, difference }: { previous: number | null; difference: number | null }) {
  if (previous === null || difference === null) return <span>Not enough prior data</span>;
  if (difference === 0) return <span>Same as the previous period</span>;
  return <span className={difference > 0 ? 'text-rose-600' : 'text-emerald-600'}>{difference > 0 ? 'Up' : 'Down'} from {formatCurrency(previous)}</span>;
}

function ShowMoreControl({ visible, total, onMore, onLess }: { visible: number; total: number; onMore: () => void; onLess: () => void }) {
  if (total <= 5) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {visible < total && <button type="button" onClick={onMore} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Show 5 more <ChevronDown className="h-3.5 w-3.5" /></button>}
      {visible > 5 && <button type="button" onClick={onLess} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">Show less <ChevronUp className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

export function CategoryBreakdownCard({ apiFetch, refreshKey, period, onDrillDown, onOpenShopping = () => undefined }: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
  period: WalmartInsightPeriod;
  onDrillDown: (filters: SpendingDrilldown) => void;
  onOpenShopping?: () => void;
}) {
  const [data, setData] = useState<SpendingBreakdownReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleCategories, setVisibleCategories] = useState(5);
  const [visibleMerchants, setVisibleMerchants] = useState(5);

  useEffect(() => {
    let active = true;
    setVisibleCategories(5);
    setVisibleMerchants(5);
    const load = async () => {
      setLoading(true);
      setError('');
      setData(null);
      try {
        const response = await apiFetch(`/api/dashboard/spending-breakdown?period=${period}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Could not load spending details.');
        if (active) setData(extractSpendingBreakdownResponse(payload));
      } catch (caught: unknown) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load spending details.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [apiFetch, period, refreshKey]);

  const open = (filter: { category?: string; householdLabel?: string; merchantFamily?: string }) => {
    if (!data) return;
    onDrillDown({ ...filter, startDate: data.currentPeriod.startDate, endDate: data.currentPeriod.endDate });
  };
  const categories = data?.categories || [];
  const merchants = data?.merchants || [];

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm md:p-7">
      {error && <p className="mb-4 flex items-center gap-2 text-sm font-medium text-rose-600"><AlertCircle className="h-4 w-4" />{error}</p>}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 xl:gap-12">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Categories</h3>
          <p className="mt-1 text-xs text-slate-500">Select one to see the purchases behind it.</p>
          {loading ? <LoadingRows /> : categories.length === 0 ? <Empty text="No category spending in this period" /> : (
            <>
              <ol className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                {categories.slice(0, visibleCategories).map(category => (
                  <li key={`${category.householdLabel ? 'household' : 'plaid'}:${category.householdLabel || category.category}`} className="py-1">
                    <button type="button" onClick={() => open(category.householdLabel ? { householdLabel: category.householdLabel } : { category: category.category })} className="flex min-h-14 w-full items-center gap-3 rounded-lg py-2 text-left hover:text-indigo-700">
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">{category.householdLabel || getCategoryLabel(category.category)}</span>
                          {category.householdLabel && <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Your label</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500"><ComparisonNote previous={category.previousSpending} difference={category.difference} /> · {category.transactionCount} {category.transactionCount === 1 ? 'purchase' : 'purchases'}</span>
                      </span>
                      <Amount value={category.currentSpending} />
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                    {category.walmart && <button type="button" onClick={onOpenShopping} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">Walmart is {formatCurrency(category.walmart.spending)} · Open Shopping <ChevronRight className="h-3.5 w-3.5" /></button>}
                  </li>
                ))}
              </ol>
              <ShowMoreControl visible={visibleCategories} total={categories.length} onMore={() => setVisibleCategories(value => Math.min(value + 5, categories.length))} onLess={() => setVisibleCategories(5)} />
            </>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Merchants</h3>
          <p className="mt-1 text-xs text-slate-500">Select one to see its transactions.</p>
          {loading ? <LoadingRows /> : merchants.length === 0 ? <Empty text="No merchant spending in this period" /> : (
            <>
              <ol className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                {merchants.slice(0, visibleMerchants).map(merchant => (
                  <li key={merchant.merchant}>
                    <button type="button" onClick={() => open({ merchantFamily: merchant.merchant })} className="flex min-h-14 w-full items-center gap-3 rounded-lg py-2 text-left hover:text-indigo-700">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{getMerchantDisplayLabel({ fallbackDescription: merchant.merchant })}</span>
                        <span className="mt-0.5 block text-xs text-slate-500"><ComparisonNote previous={merchant.previousSpending} difference={merchant.difference} /> · {merchant.transactionCount} {merchant.transactionCount === 1 ? 'purchase' : 'purchases'}</span>
                      </span>
                      <Amount value={merchant.currentSpending} />
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                  </li>
                ))}
              </ol>
              <ShowMoreControl visible={visibleMerchants} total={merchants.length} onMore={() => setVisibleMerchants(value => Math.min(value + 5, merchants.length))} onLess={() => setVisibleMerchants(5)} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Amount({ value }: { value: number }) {
  return <span className="whitespace-nowrap tabular-nums text-sm font-semibold text-slate-950">{formatCurrency(value)}</span>;
}

function LoadingRows() {
  return <div className="mt-3 space-y-2">{[1, 2, 3, 4, 5].map(item => <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{text}</p>;
}
