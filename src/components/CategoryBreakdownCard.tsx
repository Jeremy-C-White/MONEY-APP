import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Store, Tags } from 'lucide-react';
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

function ComparisonNote({ previous, difference }: {
  previous: number | null;
  difference: number | null;
}) {
  if (previous === null || difference === null) return <span>Not enough prior data</span>;
  if (difference === 0) return <span>Same as the previous period</span>;
  return (
    <span className={difference > 0 ? 'text-rose-600' : 'text-emerald-600'}>
      {difference > 0 ? 'Up' : 'Down'} from {formatCurrency(previous)}
    </span>
  );
}

function ShowMoreControl({
  visible,
  total,
  onMore,
  onLess,
}: {
  visible: number;
  total: number;
  onMore: () => void;
  onLess: () => void;
}) {
  if (total <= 5) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {visible < total && (
        <button type="button" onClick={onMore} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
          Show 5 more <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      {visible > 5 && (
        <button type="button" onClick={onLess} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
          Show less <ChevronUp className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function CategoryBreakdownCard({
  apiFetch,
  refreshKey,
  period,
  onDrillDown,
  onOpenShopping = () => undefined,
}: {
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
    onDrillDown({
      ...filter,
      startDate: data.currentPeriod.startDate,
      endDate: data.currentPeriod.endDate,
    });
  };

  const categories = data?.categories || [];
  const merchants = data?.merchants || [];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Store className="h-5 w-5 text-indigo-600" />
          <div>
            <h3 className="text-lg font-medium text-slate-900">Top merchants</h3>
            <p className="text-xs text-slate-500">Select a merchant to see its transactions</p>
          </div>
        </div>
        {error && <p className="mb-3 flex items-center gap-2 text-sm font-medium text-rose-600"><AlertCircle className="h-4 w-4" />{error}</p>}
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map(item => <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : merchants.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No merchant spending in this period</p>
        ) : (
          <>
            <ol className="divide-y divide-slate-100">
              {merchants.slice(0, visibleMerchants).map((merchant, index) => (
                <li key={merchant.merchant}>
                  <button type="button" onClick={() => open({ merchantFamily: merchant.merchant })} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-indigo-50">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{getMerchantDisplayLabel({ fallbackDescription: merchant.merchant })}</span>
                      <span className="mt-0.5 block text-xs text-slate-500"><ComparisonNote previous={merchant.previousSpending} difference={merchant.difference} /> · {merchant.transactionCount} {merchant.transactionCount === 1 ? 'purchase' : 'purchases'}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold text-slate-900">{formatCurrency(merchant.currentSpending)}</span>
                  </button>
                </li>
              ))}
            </ol>
            <ShowMoreControl visible={visibleMerchants} total={merchants.length} onMore={() => setVisibleMerchants(value => Math.min(value + 5, merchants.length))} onLess={() => setVisibleMerchants(5)} />
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Tags className="h-5 w-5 text-indigo-600" />
          <div>
            <h3 className="text-lg font-medium text-slate-900">Top categories</h3>
            <p className="text-xs text-slate-500">Estimates for mixed purchases may be broad</p>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map(item => <div key={item} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>
        ) : categories.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No category spending in this period</p>
        ) : (
          <>
            <ol className="divide-y divide-slate-100">
              {categories.slice(0, visibleCategories).map((category, index) => (
                <li key={`${category.householdLabel ? 'household' : 'plaid'}:${category.householdLabel || category.category}`} className="py-1">
                  <button type="button" onClick={() => open(category.householdLabel ? { householdLabel: category.householdLabel } : { category: category.category })} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-indigo-50">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{category.householdLabel || getCategoryLabel(category.category)}</span>
                      {category.householdLabel && (
                        <span className="mt-0.5 block truncate text-[11px] text-indigo-600">
                          Your label · Plaid: {category.sourceCategories.map(getCategoryLabel).join(', ')}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-slate-500"><ComparisonNote previous={category.previousSpending} difference={category.difference} /> · {category.transactionCount} {category.transactionCount === 1 ? 'purchase' : 'purchases'}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold text-slate-900">{formatCurrency(category.currentSpending)}</span>
                  </button>
                  {category.walmart && (
                    <button
                      type="button"
                      onClick={onOpenShopping}
                      className="ml-10 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800"
                    >
                      Walmart: {formatCurrency(category.walmart.spending)} across {category.walmart.transactionCount} {category.walmart.transactionCount === 1 ? 'purchase' : 'purchases'} · Open Shopping
                    </button>
                  )}
                </li>
              ))}
            </ol>
            <ShowMoreControl visible={visibleCategories} total={categories.length} onMore={() => setVisibleCategories(value => Math.min(value + 5, categories.length))} onLess={() => setVisibleCategories(5)} />
          </>
        )}
      </section>
    </div>
  );
}
