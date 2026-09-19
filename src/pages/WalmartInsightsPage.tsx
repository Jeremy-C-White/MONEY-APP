import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  Fuel,
  Gauge,
  Link2,
  Loader2,
  Package,
  RefreshCcw,
  ShoppingBasket,
  Unplug,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import { formatCompactCurrency } from '../components/TrendChart';
import type {
  WalmartInsightPeriod,
  WalmartInsightsResponse,
  WalmartRecentOrder,
  WalmartSourceStatus,
  WalmartTrendPoint,
} from '../types/finance';

type WalmartView = 'overview' | 'purchases' | 'fuel';

const PERIOD_OPTIONS: Array<{ value: WalmartInsightPeriod; label: string }> = [
  { value: 'last_7_days', label: '7D' },
  { value: 'last_30_days', label: '30D' },
  { value: 'last_3_months', label: '3M' },
  { value: 'last_12_months', label: '12M' },
];

const VIEW_OPTIONS: Array<{ value: WalmartView; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'fuel', label: 'Fuel' },
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

function formatTrendDate(date: string, granularity: WalmartInsightsResponse['trendGranularity']): string {
  if (granularity === 'month') return formatMonthShortWithYear(date.slice(0, 7));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatSheetReadAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'amber';
}) {
  const iconClasses = tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className={`rounded-xl p-2 ${iconClasses}`}><Icon className="h-4 w-4" /></div>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function SpendingTooltip({ active, payload }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const point = payload[0]?.payload as (WalmartTrendPoint & { label: string }) | undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold text-slate-800">{point.label}</p>
      <p className="flex min-w-40 justify-between gap-5 text-slate-500"><span>Shopping</span><strong className="text-slate-900">{formatCurrency(point.retailSpend)}</strong></p>
      <p className="mt-1 flex justify-between gap-5 text-slate-500"><span>Fuel</span><strong className="text-slate-900">{formatCurrency(point.fuelSpend)}</strong></p>
      <p className="mt-2 flex justify-between gap-5 border-t border-slate-100 pt-2 text-slate-600"><span>Total</span><strong className="text-slate-900">{formatCurrency(point.totalSpend)}</strong></p>
    </div>
  );
}

function SpendingTrend({ report, fuelOnly = false }: { report: WalmartInsightsResponse; fuelOnly?: boolean }) {
  const data = report.trend.map(point => ({
    ...point,
    label: formatTrendDate(point.periodStart, report.trendGranularity),
  }));

  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">No activity in this period.</div>;
  }

  return (
    <>
      <div className="h-64 w-full" role="img" aria-label={fuelOnly ? 'Walmart fuel spending trend' : 'Walmart shopping and fuel spending trend'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 2, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={18} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={formatCompactCurrency} width={52} />
            <Tooltip content={<SpendingTooltip />} cursor={{ fill: '#f8fafc' }} />
            {fuelOnly ? (
              <Line type="monotone" dataKey="fuelSpend" name="Fuel" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            ) : (
              <>
                <Bar dataKey="retailSpend" name="Shopping" stackId="walmart" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
                <Bar dataKey="fuelSpend" name="Fuel" stackId="walmart" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{fuelOnly ? 'Fuel spending by period' : 'Walmart spending by period'}</caption>
        <thead><tr><th>Period</th><th>Shopping</th><th>Fuel</th><th>Total</th></tr></thead>
        <tbody>{data.map(point => <tr key={point.periodStart}><th>{point.label}</th><td>{formatCurrency(point.retailSpend)}</td><td>{formatCurrency(point.fuelSpend)}</td><td>{formatCurrency(point.totalSpend)}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function PatternCallout({ report }: { report: WalmartInsightsResponse }) {
  const change = report.summary.spendChangePercentage;
  if (change === null) return null;
  const isHigher = change > 0;
  const Icon = isHigher ? ArrowUpRight : ArrowDownRight;
  const wording = change === 0 ? 'about the same as' : `${formatPercentage(Math.abs(change))} ${isHigher ? 'higher' : 'lower'} than`;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${isHigher ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p><strong>Pattern:</strong> Walmart spending is {wording} the previous equivalent period.</p>
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
      if (!response.ok) throw new Error(body?.error || 'Unable to connect the Walmart spreadsheet.');
      onConnected(extractWalmartSourceStatus(body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect the Walmart spreadsheet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><ShoppingBasket className="h-6 w-6" /></div>
      <h2 className="text-2xl font-bold text-slate-900">Connect Walmart purchase history</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Paste the Google Sheets link containing the Walmart <strong>Orders</strong> and <strong>Items</strong> tabs. Receipt detail stays separate from the bank ledger so spending is never counted twice.
      </p>
      <form onSubmit={connect} className="mt-6 space-y-3">
        <label htmlFor="walmart-sheet-url" className="block text-sm font-semibold text-slate-700">Google Sheets link</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="walmart-sheet-url" type="url" required value={spreadsheetUrl} onChange={event => setSpreadsheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {saving ? 'Checking sheet…' : 'Connect source'}
          </button>
        </div>
      </form>
      {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Privacy filter: shipping addresses, payment details, delivery instructions, barcodes, and tracking numbers are ignored.</div>
    </div>
  );
}

function PurchaseList({ report }: { report: WalmartInsightsResponse }) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 p-5">
        <div><h3 className="font-bold text-slate-900">Recent purchases</h3><p className="mt-1 text-xs text-slate-500">Open a purchase to see its cleaned receipt items.</p></div>
        <Package className="h-5 w-5 text-slate-400" />
      </div>
      {report.recentOrders.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">No purchases in this period.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {report.recentOrders.map(order => {
            const expanded = expandedOrder === order.orderNumber;
            return (
              <div key={order.orderNumber}>
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedOrder(expanded ? null : order.orderNumber)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600"><ShoppingBasket className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{formatFriendlyDate(order.date)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{channelLabels[order.channel]} · {order.itemCount} items{order.fuel ? ' · includes fuel' : ''}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(order.total)}</p>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="bg-slate-50 px-5 py-4 sm:pl-16">
                    <div className="space-y-2">
                      {order.items.length === 0 ? <p className="text-sm text-slate-500">No active receipt items were available.</p> : order.items.map((item, index) => (
                        <div key={`${item.productName}-${item.price}-${index}`} className="flex items-start justify-between gap-4 text-sm">
                          <div className="min-w-0">
                            {item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-blue-600">{item.productName}</a> : <p className="text-slate-700">{item.productName}</p>}
                            <p className="text-xs text-slate-400">Qty {formatQuantity(item.quantity)}{item.fuel ? ' · fuel' : ''}</p>
                          </div>
                          <span className="whitespace-nowrap font-medium text-slate-700">{formatCurrency(item.price)}</span>
                        </div>
                      ))}
                    </div>
                    {(order.tip > 0 || order.savings > 0) && <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-xs text-slate-500">{order.tip > 0 && <span>Tip {formatCurrency(order.tip)}</span>}{order.savings > 0 && <span className="text-emerald-600">Saved {formatCurrency(order.savings)}</span>}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OverviewView({ report }: { report: WalmartInsightsResponse }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Walmart spend" value={formatCurrency(report.summary.totalSpend)} detail="Shopping and fuel together" icon={Gauge} />
        <Metric label="Shopping spend" value={formatCurrency(report.summary.retailSpend)} detail="Walmart total less recorded fuel" icon={ShoppingBasket} />
        <Metric label="Trips & orders" value={String(report.summary.orderCount)} detail={`${formatCurrency(report.summary.averageOrder)} average`} icon={Package} />
        <Metric label="Fuel spend" value={formatCurrency(report.summary.fuelSpend)} detail={`${report.summary.fuelPurchaseCount} fill-ups`} icon={Fuel} tone="amber" />
      </div>
      <PatternCallout report={report} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><h3 className="font-bold text-slate-900">Spending trend</h3><p className="mt-1 text-xs text-slate-500">Fuel is included in the total and shown separately in amber.</p></div>
          <div className="flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />Shopping</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Fuel</span></div>
        </div>
        <SpendingTrend report={report} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">Spend mix</h3>
          <p className="mt-1 text-xs text-slate-500">A simple split based on actual receipt lines.</p>
          <div className="mt-5 divide-y divide-slate-100">
            <div className="flex items-center justify-between py-3"><span className="flex items-center gap-3 text-sm font-medium text-slate-700"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><ShoppingBasket className="h-4 w-4" /></span>Shopping</span><strong className="text-slate-900">{formatCurrency(report.summary.retailSpend)}</strong></div>
            <div className="flex items-center justify-between py-3"><span className="flex items-center gap-3 text-sm font-medium text-slate-700"><span className="rounded-lg bg-amber-50 p-2 text-amber-600"><Fuel className="h-4 w-4" /></span>Fuel{report.summary.fuelShareOfSpend !== null && <span className="text-xs font-normal text-slate-400">({formatPercentage(report.summary.fuelShareOfSpend)} of total)</span>}</span><strong className="text-slate-900">{formatCurrency(report.summary.fuelSpend)}</strong></div>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h3 className="font-bold text-slate-900">Bought most often</h3><p className="mt-1 text-xs text-slate-500">Repeat items, excluding fuel.</p></div>
          {report.topItems.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No item detail in this period.</p> : <div className="divide-y divide-slate-100">{report.topItems.slice(0, 5).map((item, index) => <div key={`${item.productName}-${index}`} className="flex items-center gap-3 px-5 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span><div className="min-w-0 flex-1">{item.productUrl ? <a href={item.productUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-800 hover:text-blue-600">{item.productName}</a> : <p className="truncate text-sm font-medium text-slate-800">{item.productName}</p>}<p className="mt-0.5 text-xs text-slate-500">{item.purchaseCount} purchases · {formatCurrency(item.spend)}</p></div></div>)}</div>}
        </section>
      </div>
    </div>
  );
}

function PurchasesView({ report }: { report: WalmartInsightsResponse }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Shopping spend" value={formatCurrency(report.summary.retailSpend)} detail="Fuel shown separately" icon={ShoppingBasket} />
        <Metric label="Average order" value={formatCurrency(report.summary.averageOrder)} detail="Across paid orders" icon={Package} />
        <Metric label="Recorded savings" value={formatCurrency(report.summary.savings)} detail={`${formatCurrency(report.summary.tips)} in delivery tips`} icon={ArrowDownRight} />
      </div>
      <PurchaseList report={report} />
      {report.priceTrends.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><h3 className="font-bold text-slate-900">Price changes worth noticing</h3><p className="mt-1 text-xs text-slate-500">Only repeat items with enough receipt history appear here.</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.priceTrends.slice(0, 4).map(trend => {
              const higher = trend.changeAmount > 0;
              return <div key={trend.productName} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><p className="line-clamp-2 text-sm font-semibold text-slate-800">{trend.productName}</p><span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${higher ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{trend.changePercentage === null ? '—' : `${higher ? '+' : ''}${formatPercentage(trend.changePercentage)}`}</span></div><p className="mt-3 text-xs text-slate-500">{formatCurrency(trend.firstUnitPrice)} → <strong className="text-slate-900">{formatCurrency(trend.latestUnitPrice)}</strong> · {trend.purchaseCount} purchases</p>{trend.productUrl && <a href={trend.productUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">View item <ExternalLink className="h-3.5 w-3.5" /></a>}</div>;
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function FuelView({ report }: { report: WalmartInsightsResponse }) {
  const hasFuel = report.summary.fuelPurchaseCount > 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Fuel spend" value={formatCurrency(report.summary.fuelSpend)} detail="Included in total Walmart spend" icon={Fuel} tone="amber" />
        <Metric label="Gallons" value={hasFuel && report.summary.fuelGallons > 0 ? formatQuantity(report.summary.fuelGallons) : 'Not available'} detail="From receipt quantities" icon={Gauge} tone="amber" />
        <Metric label="Average price" value={report.summary.averageFuelPricePerGallon === null ? 'Not available' : `${formatCurrency(report.summary.averageFuelPricePerGallon)}/gal`} detail="Based on recorded gallons" icon={ArrowDownRight} tone="amber" />
        <Metric label="Fill-ups" value={String(report.summary.fuelPurchaseCount)} detail="Distinct Walmart fuel purchases" icon={Package} tone="amber" />
      </div>
      {!hasFuel ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Fuel className="mx-auto h-7 w-7 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-800">No fuel purchases in this period</h3><p className="mt-1 text-sm text-slate-500">Try a longer period to see Walmart fuel history.</p></div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="font-bold text-slate-900">Fuel spending trend</h3><p className="mt-1 text-xs text-slate-500">Based on fuel lines in Walmart receipts.</p></div><SpendingTrend report={report} fuelOnly /></section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5"><h3 className="font-bold text-slate-900">Fuel type</h3><p className="mt-1 text-xs text-slate-500">Shown when the receipt names a grade or diesel.</p></div>
              <div className="divide-y divide-slate-100">{report.fuelGrades.map(grade => <div key={grade.grade} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-sm font-semibold text-slate-800">{grade.grade}</p><p className="mt-0.5 text-xs text-slate-500">{grade.fillUpCount} fill-ups · {formatQuantity(grade.gallons)} gal</p></div><div className="text-right"><p className="text-sm font-bold text-slate-900">{formatCurrency(grade.spend)}</p>{grade.averagePricePerGallon !== null && <p className="mt-0.5 text-xs text-slate-500">{formatCurrency(grade.averagePricePerGallon)}/gal</p>}</div></div>)}</div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5"><h3 className="font-bold text-slate-900">Recent fill-ups</h3><p className="mt-1 text-xs text-slate-500">Most recent fuel receipt lines.</p></div>
              <div className="divide-y divide-slate-100">{report.fuelPurchases.slice(0, 8).map((purchase, index) => <div key={`${purchase.orderNumber}-${purchase.productName}-${index}`} className="flex items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{formatFriendlyDate(purchase.date)}</p><p className="mt-0.5 truncate text-xs text-slate-500">{purchase.grade} · {formatQuantity(purchase.gallons)} gal</p></div><div className="text-right"><p className="text-sm font-bold text-slate-900">{formatCurrency(purchase.spend)}</p>{purchase.pricePerGallon !== null && <p className="mt-0.5 text-xs text-slate-500">{formatCurrency(purchase.pricePerGallon)}/gal</p>}</div></div>)}</div>
            </section>
          </div>
        </>
      )}
      <p className="text-xs leading-5 text-slate-500">Fuel is detected from gasoline, unleaded, and diesel receipt lines. Gallons, grade, and price per gallon appear only when the receipt provides enough detail.</p>
    </div>
  );
}

export function WalmartInsightsPage({ apiFetch }: { apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response> }) {
  const [source, setSource] = useState<WalmartSourceStatus | null>(null);
  const [report, setReport] = useState<WalmartInsightsResponse | null>(null);
  const [period, setPeriod] = useState<WalmartInsightPeriod>('last_30_days');
  const [view, setView] = useState<WalmartView>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      if (requestId === insightRequestSequence.current) setReport(extractWalmartInsightsResponse(body));
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

  if (source === null && loading) return <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking Walmart source…</div>;
  if (!source?.connected) return <ConnectSource apiFetch={apiFetch} onConnected={setSource} />;

  return (
    <div className="w-full pb-20 md:pb-8">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2 text-sm font-semibold text-blue-600"><ShoppingBasket className="h-4 w-4" /> Walmart</div><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Spending at a glance</h2><p className="mt-1 text-sm text-slate-500">A simple view of shopping, fuel, and what is changing.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="Walmart period">
            {PERIOD_OPTIONS.map(option => <button key={option.value} type="button" onClick={() => setPeriod(option.value)} aria-pressed={period === option.value} className={`min-h-11 rounded-lg px-3 text-xs font-semibold transition ${period === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{option.label}</button>)}
          </div>
          <button type="button" onClick={() => void loadInsights(period, true)} disabled={loading} aria-label="Refresh Walmart insights" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Walmart views">
        {VIEW_OPTIONS.map(option => <button key={option.value} type="button" role="tab" aria-selected={view === option.value} onClick={() => setView(option.value)} className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-semibold transition ${view === option.value ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{option.label}</button>)}
      </div>

      {error && <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {loading && !report ? <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Reading purchase history…</div> : report ? (
        <>
          <div className="mb-6 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><strong className="font-semibold text-slate-700">Walmart data</strong>{report.latestTransactionDate ? `through ${formatFriendlyDate(report.latestTransactionDate)}` : 'has no dated purchases yet'}</span>
            <span>Google Sheet checked {formatSheetReadAt(report.source.sheetReadAt)}</span>
          </div>
          {view === 'overview' && <OverviewView report={report} />}
          {view === 'purchases' && <PurchasesView report={report} />}
          {view === 'fuel' && <FuelView report={report} />}
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Use Refresh after the source sheet receives new orders.</p>
            <div className="flex min-w-0 flex-wrap items-center gap-3"><a href={report.source.spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">Open {report.source.spreadsheetTitle} <ExternalLink className="h-3.5 w-3.5" /></a><button type="button" onClick={() => void disconnect()} className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-rose-600"><Unplug className="h-3.5 w-3.5" /> Disconnect</button></div>
          </div>
        </>
      ) : null}
    </div>
  );
}
