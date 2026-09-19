import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FinancialPosition } from '../types/finance';
import { formatCurrency, formatFriendlyDate } from '../lib/formatters';
import { formatCompactCurrency } from './TrendChart';

function shortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function NetWorthTooltip({ active, payload }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-xs font-semibold text-slate-700">{formatFriendlyDate(point.date)}</p>
      <p className="mt-1 text-sm font-semibold text-indigo-700">{formatCurrency(point.estimatedNetWorth)}</p>
      <p className="text-[11px] text-slate-500">Estimated net worth</p>
    </div>
  );
}

export function NetWorthTrendChart({ financialPosition }: { financialPosition: FinancialPosition | null }) {
  const history = financialPosition?.netWorthHistory || [];
  const completeHistory = history.filter(point => point.status === 'complete');
  const completeCount = completeHistory.length;

  if (completeCount < 2) {
    const latestComplete = completeHistory[completeHistory.length - 1];
    const latestSnapshot = history[history.length - 1];
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-slate-100 px-6 text-center text-sm text-slate-500">
        {latestComplete ? (
          <>
            <p className="font-semibold text-slate-700">Snapshot saved for {formatFriendlyDate(latestComplete.date)}</p>
            <p className="mt-1 text-lg font-bold text-indigo-700">{formatCurrency(latestComplete.estimatedNetWorth)}</p>
            <p className="mt-2 text-xs text-slate-400">Capture another day to start the net-worth trend.</p>
          </>
        ) : latestSnapshot ? (
          <>
            <p className="font-semibold text-slate-700">Snapshot saved, but some balances are missing</p>
            <p className="mt-2 text-xs text-slate-400">{latestSnapshot.coveredAccountCount} of {latestSnapshot.expectedAccountCount} included accounts were captured. Incomplete days stay out of the trend.</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-slate-700">No net-worth snapshots yet</p>
            <p className="mt-2 text-xs text-slate-400">Capture today to save the first balance snapshot.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="h-64 w-full" role="img" aria-label="Estimated net worth history chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={shortDate} minTickGap={24} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={formatCompactCurrency} width={58} />
            <Tooltip content={<NetWorthTooltip />} />
            <Line type="monotone" dataKey="estimatedNetWorth" name="Estimated net worth" stroke="#4f46e5" strokeWidth={3} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Days missing any included account are left as gaps.</p>
      <table className="sr-only">
        <caption>Estimated net worth history</caption>
        <thead><tr><th>Date</th><th>Estimated net worth</th><th>Coverage</th></tr></thead>
        <tbody>{history.map(point => (
          <tr key={point.date}>
            <th>{point.date}</th>
            <td>{point.estimatedNetWorth == null ? 'Unavailable' : formatCurrency(point.estimatedNetWorth)}</td>
            <td>{point.status}</td>
          </tr>
        ))}</tbody>
      </table>
    </>
  );
}
