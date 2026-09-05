import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ExternalLink,
  Fuel,
  Link2,
  Loader2,
  Package,
  Minus,
  RefreshCcw,
  ShoppingBasket,
  Sparkles,
  Unplug,
} from 'lucide-react';
import {
  extractWalmartInsightsResponse,
  extractWalmartSourceStatus,
} from '../lib/api-contracts';
import {
  formatCurrency,
  formatFriendlyDate,
  formatMonthShortWithYear,
  formatPercentage,
} from '../lib/formatters';
import type {
  WalmartInsightPeriod,
  WalmartInsightsResponse,
  WalmartRecentOrder,
  WalmartPriceTrend,
  WalmartSourceStatus,
} from '../types/finance';

const PERIOD_OPTIONS: Array<{ value: WalmartInsightPeriod; label: string }> = [
  { value: 'last_12_months', label: '12 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
];

const channelLabels: Record<WalmartRecentOrder['channel'], string> = {
  delivery: 'Delivery',
  pickup: 'Pickup',
  shipping: 'Shipping',
  in_store: 'In store',
  online: 'Online',
};

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function PriceTrendCard({ trend }: { trend: WalmartPriceTrend }) {
  const values = trend.history.map(point => point.averageUnitPrice);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 36 - ((value - low) / range) * 30;
    return `${x},${y}`;
  }).join(' ');
  const direction = trend.changeAmount > 0 ? 'up' : trend.changeAmount < 0 ? 'down' : 'flat';
  const DirectionIcon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const directionClasses = direction === 'up'
    ? 'bg-rose-50 text-rose-600'
    : direction === 'down'
      ? 'bg-emerald-50 text-emerald-600'
      : 'bg-slate-100 text-slate-500';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-800" title={trend.productName}>{trend.productName}</p>
          <p className="mt-1 text-xs text-slate-500">Bought in {trend.purchaseCount} orders</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${directionClasses}`}>
          <DirectionIcon className="h-3.5 w-3.5" />
          {trend.changePercentage === null ? '—' : formatPercentage(Math.abs(trend.changePercentage))}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Latest effective unit price</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(trend.latestUnitPrice)}</p>
          <p className="mt-1 text-xs text-slate-400">
            First {formatCurrency(trend.firstUnitPrice)} · Range {formatCurrency(trend.lowUnitPrice)}–{formatCurrency(trend.highUnitPrice)}
          </p>
        </div>
        <svg viewBox="0 0 100 42" className="h-12 w-28 shrink-0" role="img" aria-label={`Price history for ${trend.productName}`}>
          <polyline points={points} fill="none" stroke={direction === 'up' ? '#f43f5e' : direction === 'down' ? '#10b981' : '#64748b'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-400">Through {formatFriendlyDate(trend.lastPurchased)}</span>
        {trend.productUrl && (
          <a href={trend.productUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
            Check current price <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function ConnectSource({
  apiFetch,
  onConnected,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
  onConnected: (source: WalmartSourceStatus) => void;
}) {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch('/api/walmart/source', {
        method: 'PUT',
        body: JSON.stringify({ spreadsheetUrl }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Unable to connect the Walmart spreadsheet.');
      }
      onConnected(extractWalmartSourceStatus(body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect the Walmart spreadsheet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
        <ShoppingBasket className="h-6 w-6" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900">Connect Walmart purchase history</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Paste the Google Sheets link containing the Walmart <strong>Orders</strong> and <strong>Items</strong> tabs.
        FinSync reads it as receipt detail and never adds these totals to your Plaid ledger.
      </p>

      <form onSubmit={connect} className="mt-6 space-y-3">
        <label htmlFor="walmart-sheet-url" className="block text-sm font-semibold text-slate-700">
          Google Sheets link
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="walmart-sheet-url"
            type="url"
            required
            value={spreadsheetUrl}
            onChange={event => setSpreadsheetUrl(event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {saving ? 'Checking sheet…' : 'Connect source'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
        Privacy filter: shipping addresses, payment details, delivery instructions, barcodes, and tracking numbers are ignored.
      </div>
    </div>
  );
}

export function WalmartInsightsPage({
  apiFetch,
}: {
  apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response>;
}) {
  const [source, setSource] = useState<WalmartSourceStatus | null>(null);
  const [report, setReport] = useState<WalmartInsightsResponse | null>(null);
  const [period, setPeriod] = useState<WalmartInsightPeriod>('last_12_months');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const insightRequestSequence = useRef(0);

  const loadInsights = async (selectedPeriod: WalmartInsightPeriod, refresh = false) => {
    const requestId = ++insightRequestSequence.current;
    setLoading(true);
    setError(null);
    if (!refresh) setReport(null);
    try {
      const suffix = refresh ? '&refresh=true' : '';
      const response = await apiFetch(`/api/walmart/insights?period=${selectedPeriod}${suffix}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Unable to load Walmart insights.');
      if (requestId === insightRequestSequence.current) {
        setReport(extractWalmartInsightsResponse(body));
      }
    } catch (caught) {
      if (requestId === insightRequestSequence.current) {
        setReport(null);
        setError(caught instanceof Error ? caught.message : 'Unable to load Walmart insights.');
      }
    } finally {
      if (requestId === insightRequestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadSource = async () => {
      setLoading(true);
      try {
        const response = await apiFetch('/api/walmart/source');
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'Unable to check the Walmart source.');
        const nextSource = extractWalmartSourceStatus(body);
        if (!active) return;
        setSource(nextSource);
        if (!nextSource.connected) setLoading(false);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Unable to check the Walmart source.');
        setLoading(false);
      }
    };
    void loadSource();
    return () => { active = false; };
  }, [apiFetch]);

  useEffect(() => {
    if (source?.connected) void loadInsights(period);
  }, [source?.connected, period]);

  const disconnect = async () => {
    if (!window.confirm('Disconnect this Walmart spreadsheet from FinSync? The spreadsheet itself will not be changed.')) return;
    insightRequestSequence.current += 1;
    setLoading(true);
    try {
      const response = await apiFetch('/api/walmart/source', { method: 'DELETE' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Unable to disconnect the Walmart source.');
      setSource({ connected: false });
      setReport(null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to disconnect the Walmart source.');
    } finally {
      setLoading(false);
    }
  };

  const maxMonthlySpend = useMemo(
    () => Math.max(...(report?.monthly.map(month => Math.abs(month.totalSpend)) || [0]), 1),
    [report]
  );

  if (source === null && loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking Walmart source…
      </div>
    );
  }

  if (!source?.connected) {
    return <ConnectSource apiFetch={apiFetch} onConnected={setSource} />;
  }

  return (
    <div className="w-full pb-20 md:pb-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
            <ShoppingBasket className="h-4 w-4" /> Walmart receipt intelligence
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Spending habits & items</h2>
          <p className="mt-1 text-sm text-slate-500">
            Receipt detail stays separate from your bank ledger, so spending is never counted twice.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {PERIOD_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition ${
                  period === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadInsights(period, true)}
            disabled={loading}
            aria-label="Refresh Walmart insights"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !report ? (
        <div className="flex min-h-64 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Reading purchase history…
        </div>
      ) : report ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Net Walmart spend"
              value={formatCurrency(report.summary.totalSpend)}
              detail={`${report.summary.orderCount} purchases${report.summary.returnCount > 0 ? ` · ${formatCurrency(report.summary.returnAmount)} returned` : ''}`}
              icon={BarChart3}
            />
            <Metric label="Average order" value={formatCurrency(report.summary.averageOrder)} detail="Across paid orders" icon={ShoppingBasket} />
            <Metric label="Fuel item spend" value={formatCurrency(report.summary.fuelSpend)} detail={`${report.summary.fuelPurchaseCount} fuel purchases`} icon={Fuel} />
            <Metric label="Recorded savings" value={formatCurrency(report.summary.savings)} detail={`${formatCurrency(report.summary.tips)} in delivery tips`} icon={Sparkles} />
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Monthly Walmart spending</h3>
                  <p className="mt-1 text-xs text-slate-500">Fuel is shown within each month, not added on top.</p>
                </div>
              </div>
              {report.monthly.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">No Walmart order activity in this period.</p>
              ) : (
                <div className="flex h-52 items-end gap-2 overflow-x-auto pb-1">
                  {report.monthly.map(month => {
                    const isReturnMonth = month.totalSpend < 0;
                    const totalHeight = Math.max(8, (Math.abs(month.totalSpend) / maxMonthlySpend) * 160);
                    const fuelHeight = month.totalSpend > 0
                      ? Math.min(totalHeight, (month.fuelSpend / month.totalSpend) * totalHeight)
                      : 0;
                    return (
                      <div key={month.month} className="group flex min-w-12 flex-1 flex-col items-center">
                        <div className="mb-2 hidden whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white group-hover:block">
                          {formatCurrency(month.totalSpend)} · {month.orderCount} orders
                        </div>
                        <div className={`relative w-full max-w-10 overflow-hidden rounded-t-lg ${isReturnMonth ? 'bg-rose-300' : 'bg-blue-200'}`} style={{ height: `${totalHeight}px` }}>
                          {fuelHeight > 0 && <div className="absolute inset-x-0 bottom-0 bg-amber-400" style={{ height: `${fuelHeight}px` }} />}
                        </div>
                        <span className="mt-2 text-[10px] font-medium text-slate-500">{formatMonthShortWithYear(month.month)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-blue-200" /> Retail</span>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Fuel</span>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-rose-300" /> Net return</span>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
              <div className="flex items-center gap-2 text-amber-300">
                <Fuel className="h-5 w-5" />
                <h3 className="font-bold text-white">Fuel snapshot</h3>
              </div>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-xs text-white/60">Gallons recorded</p>
                  <p className="mt-1 text-3xl font-bold">{formatQuantity(report.summary.fuelGallons)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-xs text-white/60">Average per gallon</p>
                    <p className="mt-1 font-bold">{formatCurrency(report.summary.averageFuelPricePerGallon)}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-xs text-white/60">Purchase visits</p>
                    <p className="mt-1 font-bold">{report.summary.fuelPurchaseCount}</p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-white/50">
                  Fuel is detected from gasoline, unleaded, and diesel receipt lines. Item totals may differ from card charges when rewards or discounts apply.
                </p>
              </div>
            </section>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-bold text-slate-900">Where the money went</h3>
              <div className="mt-5 space-y-5">
                {([
                  ['Online, delivery & pickup', report.summary.onlineSpend, 'bg-blue-500'],
                  ['In store', report.summary.inStoreSpend, 'bg-indigo-400'],
                ] as const).map(([label, value, color]) => {
                  const channelSpend = report.summary.onlineSpend + report.summary.inStoreSpend;
                  const percentage = channelSpend > 0 ? value / channelSpend : 0;
                  return (
                    <div key={label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{label}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(value)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percentage * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-right text-xs text-slate-400">{Math.round(percentage * 100)}%</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5">
                <h3 className="font-bold text-slate-900">Most frequently purchased</h3>
                <p className="mt-1 text-xs text-slate-500">Ranked by distinct Walmart orders, excluding fuel.</p>
              </div>
              <div className="max-h-80 divide-y divide-slate-100 overflow-auto">
                {report.topItems.map((item, index) => (
                  <div key={item.productName} className="flex gap-3 px-5 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      {item.productUrl ? (
                        <a href={item.productUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:text-blue-600" title={item.productName}>{item.productName}</a>
                      ) : (
                        <p className="truncate text-sm font-medium text-slate-800" title={item.productName}>{item.productName}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500">{item.purchaseCount} orders · {formatQuantity(item.quantity)} quantity · {formatCurrency(item.spend)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Price watch</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Effective unit price is the receipt line total divided by quantity. This keeps multi-packs, weighted produce, and repeated units comparable over time.
                </p>
              </div>
              <p className="shrink-0 text-xs font-medium text-slate-400">Most-bought items with 2+ purchases</p>
            </div>
            {report.priceTrends.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
                More repeat purchases are needed before price changes can be measured.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {report.priceTrends.map(trend => (
                  <React.Fragment key={trend.productName}>
                    <PriceTrendCard trend={trend} />
                  </React.Fragment>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              “Check current price” opens the exact product saved in your Walmart export. FinSync does not claim a live price because Walmart consumer prices can vary by store, fulfillment method, membership, and promotion.
            </p>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="font-bold text-slate-900">Recent Walmart orders</h3>
                <p className="mt-1 text-xs text-slate-500">Open an order to see its cleaned receipt items.</p>
              </div>
              <Package className="h-5 w-5 text-slate-400" />
            </div>
            <div className="divide-y divide-slate-100">
              {report.recentOrders.map(order => {
                const expanded = expandedOrder === order.orderNumber;
                return (
                  <div key={order.orderNumber}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedOrder(expanded ? null : order.orderNumber)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
                    >
                      <div className={`rounded-xl p-2 ${order.fuel ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                        {order.fuel ? <Fuel className="h-4 w-4" /> : <ShoppingBasket className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{formatFriendlyDate(order.date)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{channelLabels[order.channel]} · {order.itemCount} cleaned items</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</p>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <div className="bg-slate-50 px-5 py-4 sm:pl-16">
                        <div className="space-y-2">
                          {order.items.length === 0 ? (
                            <p className="text-sm text-slate-500">No active receipt items were available for this order.</p>
                          ) : order.items.map((item, index) => (
                            <div key={`${item.productName}-${item.price}-${index}`} className="flex items-start justify-between gap-4 text-sm">
                              <div className="min-w-0">
                                {item.productUrl ? (
                                  <a href={item.productUrl} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-blue-600">{item.productName}</a>
                                ) : (
                                  <p className="text-slate-700">{item.productName}</p>
                                )}
                                <p className="text-xs text-slate-400">Qty {formatQuantity(item.quantity)}</p>
                              </div>
                              <span className="whitespace-nowrap font-medium text-slate-700">{formatCurrency(item.price)}</span>
                            </div>
                          ))}
                        </div>
                        {(order.tip > 0 || order.savings > 0) && (
                          <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                            {order.tip > 0 && <span>Tip {formatCurrency(order.tip)}</span>}
                            {order.savings > 0 && <span className="text-emerald-600">Saved {formatCurrency(order.savings)}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Cleanup applied: {report.quality.canceledItemRowsExcluded} canceled rows and {report.quality.statusDuplicateRowsExcluded} status duplicates excluded.
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <a href={report.source.spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
                Open {report.source.spreadsheetTitle} <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button type="button" onClick={() => void disconnect()} className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-rose-600">
                <Unplug className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
