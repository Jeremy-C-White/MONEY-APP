import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Landmark } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CashFlowForecast } from '../types/finance';
import { formatCurrency, formatFriendlyDate } from '../lib/formatters';
import { formatCompactCurrency } from './TrendChart';

function shortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function ForecastTooltip({ active, payload }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-xs font-semibold text-slate-700">{formatFriendlyDate(point.date)}</p>
      <p className="mt-1 text-sm font-semibold text-indigo-700">{formatCurrency(point.balance)}</p>
      <p className="text-[11px] text-slate-500">Scheduled balance</p>
    </div>
  );
}

function accountName(forecast: CashFlowForecast): string {
  const account = forecast.forecastAccount;
  if (!account) return 'Payroll checking';
  return account.accountMask
    ? `${account.accountName} ••••${account.accountMask}`
    : account.accountName;
}

export function CashFlowForecastCard({
  forecast,
  loading,
}: {
  forecast: CashFlowForecast | null;
  loading?: boolean;
}) {
  if (loading && !forecast) {
    return <div className="mb-8 h-[34rem] animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!forecast) return null;

  const paycheckEvents = forecast.scheduledEvents.filter(event => event.kind === 'paycheck');
  const nextPaycheckDate = paycheckEvents[0]?.date || null;
  const nextPaycheckAmount = nextPaycheckDate
    ? paycheckEvents
        .filter(event => event.date === nextPaycheckDate)
        .reduce((total, event) => total + event.amount, 0)
    : null;
  const affectedBills = forecast.upcomingBills.filter(event => event.affectsForecastBalance);
  const otherAccountBills = forecast.upcomingBills.filter(event => !event.affectsForecastBalance);
  const upcomingTotal = forecast.upcomingBills.reduce((total, event) => total + event.amount, 0);

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4 md:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-slate-900">
              <Landmark className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-medium">Scheduled cash outlook</h3>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              A 30-day view using regular Verizon payroll and confirmed recurring bills only.
            </p>
          </div>
          <div className="rounded-xl bg-indigo-50 px-4 py-3 sm:text-right">
            <p className="text-xs font-medium text-indigo-600">Bills expected in 7 days</p>
            <p className="mt-0.5 text-xl font-semibold text-indigo-950">
              {formatCurrency(upcomingTotal)}
            </p>
            <p className="text-[11px] text-indigo-700">
              {forecast.upcomingBills.length} confirmed {forecast.upcomingBills.length === 1 ? 'bill' : 'bills'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0">
          {forecast.status === 'ready' ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Starting {forecast.balanceBasis}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {formatCurrency(forecast.startingBalance)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{accountName(forecast)}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                    Next regular pay
                  </p>
                  <p className="mt-1 text-xl font-semibold text-emerald-950">
                    {nextPaycheckAmount != null ? formatCurrency(nextPaycheckAmount) : '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    {nextPaycheckDate ? formatFriendlyDate(nextPaycheckDate) : 'No date scheduled'}
                    {forecast.paycheckStreams.length > 1
                      ? ` · ${forecast.paycheckStreams.length} regular payroll streams`
                      : ''}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${
                  (forecast.minimumBalance ?? 0) < 0 ? 'bg-rose-50' : 'bg-sky-50'
                }`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                    (forecast.minimumBalance ?? 0) < 0 ? 'text-rose-600' : 'text-sky-600'
                  }`}>
                    Lowest scheduled balance
                  </p>
                  <p className={`mt-1 text-xl font-semibold ${
                    (forecast.minimumBalance ?? 0) < 0 ? 'text-rose-950' : 'text-sky-950'
                  }`}>
                    {formatCurrency(forecast.minimumBalance)}
                  </p>
                  <p className={`mt-0.5 text-xs ${
                    (forecast.minimumBalance ?? 0) < 0 ? 'text-rose-700' : 'text-sky-700'
                  }`}>
                    {formatFriendlyDate(forecast.minimumBalanceDate)}
                  </p>
                </div>
              </div>

              <div className="mt-6 h-72 w-full" role="img" aria-label="Projected daily checking balance for the next 30 days">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecast.dailyBalances} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickFormatter={shortDate}
                      minTickGap={28}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickFormatter={formatCompactCurrency}
                      width={58}
                    />
                    <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="4 4" />
                    <Tooltip content={<ForecastTooltip />} />
                    <Line
                      type="stepAfter"
                      dataKey="balance"
                      name="Scheduled balance"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <table className="sr-only">
                <caption>Projected daily checking balances</caption>
                <thead><tr><th>Date</th><th>Scheduled balance</th></tr></thead>
                <tbody>
                  {forecast.dailyBalances.map(point => (
                    <tr key={point.date}><th>{point.date}</th><td>{formatCurrency(point.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className={`rounded-xl border p-5 ${
              forecast.status === 'stale'
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                  forecast.status === 'stale' ? 'text-amber-600' : 'text-slate-500'
                }`} />
                <div>
                  <h4 className="font-semibold text-slate-900">Balance projection not ready</h4>
                  <p className="mt-1 text-sm text-slate-600">{forecast.warning}</p>
                </div>
              </div>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            This is a scheduled-cash view, not a guarantee. It excludes bonuses, tax refunds,
            rewards, Zelle reimbursements, day-to-day spending, and credit-card activity until
            money actually moves through this checking account.
          </p>
        </div>

        <aside className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-600" />
            <h4 className="font-semibold text-slate-900">Upcoming bills</h4>
          </div>
          <p className="mt-1 text-xs text-slate-500">Confirmed services expected in the next 7 days.</p>

          {forecast.upcomingBills.length === 0 ? (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-white p-3 text-sm text-slate-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
              <span>No confirmed bills are expected in the next 7 days.</span>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {[...affectedBills, ...otherAccountBills].map(event => (
                <div key={event.eventId} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{event.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatFriendlyDate(event.date)}</p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold text-slate-900">
                      {formatCurrency(event.amount)}
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {event.accountName || 'Account not identified'}
                    {!event.affectsForecastBalance ? ' · shown for awareness, not deducted here' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
