import React from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '../types/finance';
import {
  formatCurrency,
  formatMonthLabel,
  formatMonthShort,
  formatMonthShortWithYear,
} from '../lib/formatters';

export function formatCompactCurrency(value: number): string {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absoluteValue >= 1_000_000) {
    return `${sign}$${Number((absoluteValue / 1_000_000).toFixed(1))}M`;
  }
  if (absoluteValue >= 1_000) {
    return `${sign}$${Number((absoluteValue / 1_000).toFixed(1))}k`;
  }
  return `${sign}$${Math.round(absoluteValue)}`;
}

function chartMonthLabel(data: TrendPoint[], index: number): string {
  const point = data[index];
  const crossedIntoNewYear = index > 0 && (
    point.month.slice(0, 4) !== data[index - 1].month.slice(0, 4)
  );
  return crossedIntoNewYear
    ? formatMonthShortWithYear(point.month)
    : formatMonthShort(point.month);
}

function CashFlowTooltip({ active, payload, label }: any) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const month = payload[0]?.payload?.month || label;

  const labels: Record<string, string> = {
    income: 'Income',
    spending: 'Spending',
    netCashFlow: 'Net cash flow',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-xs font-semibold text-slate-700">
        {formatMonthLabel(month)}
      </p>
      <div className="space-y-1">
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex min-w-44 items-center justify-between gap-6 text-xs">
            <span className="flex items-center gap-2 text-slate-500">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {labels[entry.dataKey] || entry.name}
            </span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendChart({ data, loading }: { data: TrendPoint[]; loading?: boolean }) {
  if (loading) {
    return <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100 md:h-80" />;
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-slate-100 text-slate-400 md:h-80">
        No trend data available
      </div>
    );
  }

  const chartData = data.map((point, index) => ({
    ...point,
    chartLabel: chartMonthLabel(data, index),
  }));

  return (
    <div className="h-64 w-full md:h-80">
      <div
        className="h-full w-full"
        role="img"
        aria-label="Monthly income, spending, and net cash flow chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="chartLabel"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 11 }}
            minTickGap={16}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={formatCompactCurrency}
            width={56}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Tooltip content={<CashFlowTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Bar
            dataKey="income"
            name="Income"
            fill="#34d399"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="spending"
            name="Spending"
            fill="#818cf8"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Line
            type="monotone"
            dataKey="netCashFlow"
            name="Net cash flow"
            stroke="#0f172a"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#0f172a', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Monthly cash flow values</caption>
        <thead>
          <tr><th>Month</th><th>Income</th><th>Spending</th><th>Net cash flow</th></tr>
        </thead>
        <tbody>
          {data.map(point => (
            <tr key={point.month}>
              <th>{formatMonthLabel(point.month)}</th>
              <td>{formatCurrency(point.income)}</td>
              <td>{formatCurrency(point.spending)}</td>
              <td>{formatCurrency(point.netCashFlow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
