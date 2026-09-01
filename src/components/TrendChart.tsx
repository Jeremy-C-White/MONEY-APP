import React from 'react';
import { TrendPoint } from '../types/finance';

export function TrendChart({ data, loading }: { data: TrendPoint[], loading?: boolean }) {
  if (loading) {
    return <div className="w-full h-48 md:h-64 bg-slate-100 rounded-xl animate-pulse"></div>;
  }
  if (!data || data.length === 0) {
    return <div className="w-full h-48 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400">No trend data available</div>;
  }

  const maxVal = Math.max(...data.flatMap(d => [Math.abs(d.income), Math.abs(d.spending)])) || 1;
  
  return (
    <div className="w-full h-48 md:h-64 flex items-end justify-between px-1 sm:px-4 relative pb-8 pt-4 border-b border-slate-100">
      {data.map((d, i) => {
        const incomePct = Math.max(0, (d.income / maxVal) * 100);
        const spendPct = Math.max(0, (d.spending / maxVal) * 100);
        
        // Only show every other label on mobile if there are many data points
        const showLabelOnMobile = data.length <= 6 || i % 2 === 0;
        
        return (
          <div key={d.month} className="flex flex-col items-center flex-1 h-full justify-end relative group">
            <div className="w-full flex justify-center items-end h-full gap-[1px] sm:gap-1 px-[1px] sm:px-1">
              <div 
                className="w-full max-w-[20px] bg-emerald-400 rounded-t-md opacity-90 transition-all group-hover:opacity-100" 
                style={{ height: `${incomePct}%`, minHeight: incomePct > 0 ? '2px' : '0' }}
                title={`Income: ${d.income}`}
              ></div>
              <div 
                className="w-full max-w-[20px] bg-indigo-400 rounded-t-md opacity-90 transition-all group-hover:opacity-100" 
                style={{ height: `${spendPct}%`, minHeight: spendPct > 0 ? '2px' : '0' }}
                title={`Spending: ${d.spending}`}
              ></div>
            </div>
            <div className={`absolute -bottom-6 text-[10px] sm:text-xs font-medium text-slate-400 whitespace-nowrap ${showLabelOnMobile ? 'block' : 'hidden sm:block'}`}>
              {d.month.split(' ')[0]}
            </div>
          </div>
        )
      })}
    </div>
  );
}
