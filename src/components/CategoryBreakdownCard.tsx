import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { extractCategoryBreakdownResponse } from '../lib/api-contracts';
import {
  formatCurrency,
  formatPercentage,
  getCategoryLabel,
  getDetailedCategoryLabel,
  getMerchantDisplayLabel,
} from '../lib/formatters';
import type {
  CategoryBreakdownCategory,
  CategoryBreakdownResponse,
  CategoryPeriod,
} from '../types/finance';

const PERIOD_OPTIONS: Array<{ value: CategoryPeriod; label: string }> = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
];

function periodLabel(period: CategoryPeriod): string {
  return PERIOD_OPTIONS.find(option => option.value === period)?.label || period;
}

function ChangeNote({ change, previousSpending }: { change: number | null; previousSpending: number | null }) {
  if (change === null || previousSpending === null) return null;
  if (change > 0) {
    return <span className="text-rose-500">up from {formatCurrency(previousSpending)}</span>;
  }
  if (change < 0) {
    return <span className="text-emerald-500">down from {formatCurrency(previousSpending)}</span>;
  }
  return <span className="text-slate-400">unchanged from {formatCurrency(previousSpending)}</span>;
}

function CategoryRow({
  category,
  expanded,
  onToggle,
}: {
  category: CategoryBreakdownCategory;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left"
      >
        <div className="flex justify-between gap-3 text-sm mb-1">
          <span className="font-medium text-slate-700 truncate flex items-center gap-1 min-w-0">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            )}
            <span className="truncate">{getCategoryLabel(category.category)}</span>
          </span>
          <span className="font-medium text-slate-900 whitespace-nowrap">
            {formatCurrency(category.netSpending)}
          </span>
        </div>
        <div className="flex justify-between gap-3 text-[11px] text-slate-400 mb-1.5">
          <span>
            {category.transactionCount} {category.transactionCount === 1 ? 'transaction' : 'transactions'}
            {category.change !== null && (
              <>
                {' · '}
                <ChangeNote change={category.change} previousSpending={category.previousSpending} />
              </>
            )}
          </span>
          <span>{formatPercentage(category.percentage)}</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div
            className="bg-indigo-500 h-1.5 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, category.percentage * 100))}%` }}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-2 ml-5 space-y-3 border-l border-slate-100 pl-3">
          {category.details.map(detail => (
            <div key={detail.categoryDetailed}>
              <div className="flex justify-between gap-3 text-xs font-semibold text-slate-600">
                <span className="truncate">{getDetailedCategoryLabel(detail.categoryDetailed, category.category)}</span>
                <span className="whitespace-nowrap">{formatCurrency(detail.netSpending)}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {detail.merchants.map(merchant => (
                  <div key={merchant.merchant} className="flex justify-between gap-3 text-[11px] text-slate-400">
                    <span className="truncate">
                      {getMerchantDisplayLabel({ fallbackDescription: merchant.merchant })}
                    </span>
                    <span className="whitespace-nowrap">{formatCurrency(merchant.netSpending)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryBreakdownCard({
  apiFetch,
  refreshKey,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  refreshKey: number;
}) {
  const [period, setPeriod] = useState<CategoryPeriod>('this_month');
  const [data, setData] = useState<CategoryBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setData(null);
      try {
        const response = await apiFetch(`/api/dashboard/category-breakdown?period=${period}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Could not load the category breakdown.');
        if (active) setData(extractCategoryBreakdownResponse(payload));
      } catch (caught: unknown) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not load the category breakdown.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [apiFetch, period, refreshKey]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(current => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const categories = data?.categories ?? [];
  const merchants = data?.merchants ?? [];
  const activeLabel = periodLabel(period);

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h3 className="text-lg font-medium text-slate-900">Spending Breakdown</h3>
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg gap-1">
          {PERIOD_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap min-h-[36px] flex items-center justify-center ${
                period === option.value
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-rose-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Top Categories <span className="normal-case font-normal">· {activeLabel}</span>
          </h4>
          {loading && categories.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(item => (
                <div key={item} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">No categories found</div>
          ) : (
            <div className="space-y-5">
              {categories.slice(0, 8).map(category => (
                <React.Fragment key={category.category}>
                  <CategoryRow
                    category={category}
                    expanded={expandedCategories.has(category.category)}
                    onToggle={() => toggleCategory(category.category)}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Top Merchants <span className="normal-case font-normal">· {activeLabel}</span>
          </h4>
          {loading && merchants.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(item => (
                <div key={item} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : merchants.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">No merchants found</div>
          ) : (
            <div className="space-y-1">
              {merchants.slice(0, 8).map(merchant => (
                <div
                  key={merchant.merchant}
                  className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  <div className="truncate pr-4">
                    <p className="font-medium text-slate-900 truncate">
                      {getMerchantDisplayLabel({ fallbackDescription: merchant.merchant })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {merchant.transactionCount}{' '}
                      {merchant.transactionCount === 1 ? 'transaction' : 'transactions'}
                    </p>
                  </div>
                  <div className="font-medium text-slate-900 whitespace-nowrap">
                    {formatCurrency(merchant.netSpending)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
