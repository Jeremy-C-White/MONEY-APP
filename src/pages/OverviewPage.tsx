import React, { useEffect, useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import { TrendChart } from '../components/TrendChart';
import { formatCurrency, formatPercentage, getCategoryLabel, getClassificationLabel, formatFriendlyDate } from '../lib/formatters';
import { 
  DashboardSummary, DashboardCategory, DashboardMerchant, TrendPoint, 
  DashboardVerificationResponse, Transaction, DashboardCategoriesResponse,
  DashboardMerchantsResponse, DashboardTrendsResponse, TransactionsResponse
} from '../types/finance';
import { AlertCircle, ArrowRight, Loader2, RefreshCcw } from 'lucide-react';

export function OverviewPage({ 
  apiFetch, 
  refreshKey, 
  setActiveTab 
}: { 
  apiFetch: (e: string, o?: any) => Promise<Response>,
  refreshKey: number,
  setActiveTab: (tab: string) => void
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [merchants, setMerchants] = useState<DashboardMerchant[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [verification, setVerification] = useState<DashboardVerificationResponse | null>(null);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [pendingTxs, setPendingTxs] = useState<Transaction[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<'6m' | '12m' | 'ytd'>('12m');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, catRes, merRes, trndRes, verRes, recRes, pendRes] = await Promise.all([
        apiFetch('/api/dashboard/summary'),
        apiFetch('/api/dashboard/categories'),
        apiFetch('/api/dashboard/merchants'),
        apiFetch(`/api/dashboard/trends?range=${trendRange}`),
        apiFetch('/api/dashboard/verification'),
        apiFetch('/api/transactions?status=posted&limit=6'),
        apiFetch('/api/transactions?status=pending&limit=4')
      ]);

      if (!sumRes.ok || !catRes.ok || !merRes.ok || !trndRes.ok || !verRes.ok || !recRes.ok || !pendRes.ok) {
        throw new Error("Failed to load overview data.");
      }

      const sumData = await sumRes.json() as DashboardSummary;
      const catData = await catRes.json() as DashboardCategoriesResponse;
      const merData = await merRes.json() as DashboardMerchantsResponse;
      const trndData = await trndRes.json() as DashboardTrendsResponse;
      const verData = await verRes.json() as DashboardVerificationResponse;
      const recData = await recRes.json() as TransactionsResponse;
      const pendData = await pendRes.json() as TransactionsResponse;

      setSummary(sumData);
      setCategories(catData.categories || []);
      setMerchants(merData.merchants || []);
      setTrends(trndData.monthly || []);
      setVerification(verData);
      setRecentTxs(recData.transactions || []);
      setPendingTxs(pendData.transactions || []);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An unexpected error occurred loading your dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [trendRange, refreshKey]);

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-sm border border-rose-100">
        <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-rose-500" />
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-2">Unable to load dashboard</h3>
        <p className="text-slate-500 text-center mb-6 max-w-sm">{error}</p>
        <button 
          onClick={fetchData}
          className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-medium transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const spendingDiff = summary?.comparison?.spendingDifference;
  const spendingPct = summary?.comparison?.spendingPercentageChange;
  
  const spendingSubtitle = (
    <div className="flex items-center space-x-1">
      {spendingDiff != null && spendingPct != null ? (
        <>
          <span className={spendingDiff > 0 ? "text-rose-500 font-medium" : "text-emerald-500 font-medium"}>
             {spendingDiff > 0 ? '+' : ''}{formatCurrency(spendingDiff)}
          </span>
          <span className="text-slate-400">({spendingDiff > 0 ? '+' : ''}{formatPercentage(spendingPct)}) vs last month</span>
        </>
      ) : <span className="text-slate-400">No previous data</span>}
    </div>
  );

  return (
    <div className="w-full pb-20 md:pb-8">
      {summary?.currentMonth?.month && (
        <h2 className="text-xl font-bold text-slate-900 mb-6">{summary.currentMonth.month}</h2>
      )}
      
      {error && summary && (
        <div className="mb-6 p-4 rounded-xl flex items-center justify-between shadow-sm bg-rose-50 text-rose-700 border border-rose-200">
          <span className="text-sm font-medium">Failed to refresh some data. Showing last known state.</span>
          <button onClick={fetchData} className="opacity-75 hover:opacity-100 text-sm font-medium underline">Retry</button>
        </div>
      )}

      {verification?.reconciliation?.unknownTransferCount ? (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 sm:mt-0 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-amber-900">Needs Review</h4>
              <p className="text-sm text-amber-700">
                {verification.reconciliation.unknownTransferCount} transfers ({formatCurrency(verification.reconciliation.unknownTransferAmount)}) are excluded from totals until classified.
              </p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('settings')}
            className="px-4 py-2 bg-white border border-amber-200 hover:bg-amber-100 text-amber-800 text-sm font-medium rounded-lg shadow-sm whitespace-nowrap transition-colors"
          >
            See Verification in Settings
          </button>
        </div>
      ) : null}

      {/* Main Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard 
          title="Spending" 
          value={formatCurrency(summary?.currentMonth?.spending)} 
          subtitle={spendingSubtitle}
          loading={loading && !summary}
        />
        <MetricCard 
          title="Income" 
          value={formatCurrency(summary?.currentMonth?.income)} 
          loading={loading && !summary}
        />
        <MetricCard 
          title="Net Cash Flow" 
          value={formatCurrency(summary?.currentMonth?.netCashFlow)} 
          loading={loading && !summary}
        />
        <MetricCard 
          title="Savings Rate" 
          value={formatPercentage(summary?.currentMonth?.savingsRate)} 
          loading={loading && !summary}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Trends */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-slate-900">Cash Flow Trends</h3>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {(['6m', '12m', 'ytd'] as const).map(r => (
                <button 
                  key={r}
                  onClick={() => setTrendRange(r)}
                  className={`px-3 sm:px-4 py-1.5 text-xs font-medium rounded-md uppercase min-w-[44px] min-h-[44px] sm:min-h-0 flex items-center justify-center ${trendRange === r ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <TrendChart data={trends} loading={loading && !trends.length} />
          <div className="flex justify-center space-x-6 mt-4">
             <div className="flex items-center text-sm text-slate-500"><div className="w-3 h-3 bg-emerald-400 rounded-sm mr-2"></div>Income</div>
             <div className="flex items-center text-sm text-slate-500"><div className="w-3 h-3 bg-indigo-400 rounded-sm mr-2"></div>Spending</div>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-6">Top Categories</h3>
          {loading && !categories.length ? (
            <div className="space-y-4">
               {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>)}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">No categories found</div>
          ) : (
            <div className="space-y-5">
              {categories.slice(0, 5).map(c => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700 truncate mr-2">{getCategoryLabel(c.category)}</span>
                    <span className="font-medium text-slate-900">{formatCurrency(c.netSpending)}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, c.percentage * 100))}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-slate-900">Posted Transactions</h3>
          </div>
          {pendingTxs.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pending</h4>
              <div className="space-y-3">
                {pendingTxs.map(t => (
                  <TransactionRow key={t.transactionId} tx={t} />
                ))}
              </div>
            </div>
          )}
          
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Posted</h4>
            {loading && !recentTxs.length ? (
               <div className="space-y-4">
                 {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse"></div>)}
               </div>
            ) : recentTxs.length === 0 ? (
               <div className="text-sm text-slate-500 text-center py-4">No posted transactions</div>
            ) : (
              <div className="space-y-3">
                {recentTxs.map(t => (
                  <TransactionRow key={t.transactionId} tx={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Merchants */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-6">Top Merchants</h3>
          {loading && !merchants.length ? (
            <div className="space-y-4">
               {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse"></div>)}
            </div>
          ) : merchants.length === 0 ? (
             <div className="text-sm text-slate-500 text-center py-4">No merchants found</div>
          ) : (
            <div className="space-y-4">
              {merchants.slice(0, 5).map(m => (
                <div key={m.merchant} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition-colors">
                  <div className="truncate pr-4">
                    <p className="font-medium text-slate-900 truncate">{m.merchant}</p>
                    <p className="text-xs text-slate-500">{m.transactionCount} transactions</p>
                  </div>
                  <div className="font-medium text-slate-900 whitespace-nowrap">
                    {formatCurrency(m.netSpending)}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
             <div>
               <p className="text-xs text-slate-500 mb-1">Pending Spending</p>
               <p className="font-medium text-slate-900">{formatCurrency(summary?.allTime?.pendingSpending)}</p>
             </div>
             <div>
               <p className="text-xs text-slate-500 mb-1">Active Posted</p>
               <p className="font-medium text-slate-900">{summary?.activePostedCount || 0} rows</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ tx, key }: { tx: Transaction, key?: React.Key }) {
  const isPositive = tx.cashFlowAmount > 0;
  let label = getClassificationLabel(tx.classification);
  if (tx.classification === 'other' && tx.normalizedCategory.includes('TRANSFER')) {
     label = 'Needs Review';
  }
  
  return (
    <div className="flex justify-between items-center p-2.5 sm:p-3 hover:bg-slate-50 rounded-xl transition-colors text-sm">
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center space-x-2">
          <p className="font-medium text-slate-900 truncate">{tx.normalizedMerchant || tx.name}</p>
        </div>
        <div className="flex items-center text-xs text-slate-500 mt-0.5 space-x-2 truncate">
          <span>{formatFriendlyDate(tx.normalizedDate)}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0"></span>
          <span className="truncate">{label}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0 hidden sm:block"></span>
          <span className="truncate hidden sm:block">{tx.accountSubtype || tx.accountType}</span>
        </div>
      </div>
      <div className={`font-medium whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-slate-900'}`}>
        {isPositive ? '+' : ''}{formatCurrency(tx.cashFlowAmount)}
      </div>
    </div>
  );
}
