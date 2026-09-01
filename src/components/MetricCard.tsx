import React from 'react';

export function MetricCard({ title, value, subtitle, highlight, loading }: { title: string, value: string, subtitle?: React.ReactNode, highlight?: boolean, loading?: boolean }) {
  return (
    <div className={`p-4 md:p-6 bg-white rounded-2xl shadow-sm border ${highlight ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100'}`}>
      <h3 className="text-sm font-medium text-slate-500 mb-2">{title}</h3>
      {loading ? (
        <div className="h-8 w-24 bg-slate-200 rounded animate-pulse"></div>
      ) : (
        <div className="text-2xl md:text-3xl font-semibold text-slate-900">{value}</div>
      )}
      {subtitle && (
        <div className="mt-2 text-sm text-slate-500">
          {loading ? (
             <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mt-1"></div>
          ) : subtitle}
        </div>
      )}
    </div>
  );
}
