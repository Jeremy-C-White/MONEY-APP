import React from 'react';
import { TrendPoint } from '../types/finance';

export function TrendChart({ data, loading }: { data: TrendPoint[], loading?: boolean }) {
  if (loading) {
    return <div className="w-full h-48 md:h-64 bg-slate-100 rounded-xl animate-pulse"></div>;
  }
  if (!data || data.length === 0) {
    return <div className="w-full h-48 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400">No trend data available</div>;
  }

  const viewBoxWidth = 1000;
  const viewBoxHeight = 300;
  const chartHeight = 260;
  const paddingBottom = 40;
  
  const maxVal = Math.max(...data.flatMap(d => [Math.abs(d.income), Math.abs(d.spending)])) || 1;
  const barWidth = Math.max(12, Math.min(40, (viewBoxWidth / data.length) * 0.3));
  
  return (
    <div className="w-full overflow-x-auto custom-scrollbar">
      <div className="min-w-[400px] h-48 md:h-64 w-full relative">
        <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full h-full" preserveAspectRatio="none">
          {data.map((d, i) => {
            const xSection = (i / Math.max(1, data.length - 1)) * (viewBoxWidth - 100) + 50; // Keep away from edges
            const incomeH = (d.income / maxVal) * chartHeight;
            const spendH = (d.spending / maxVal) * chartHeight;
            
            return (
              <g key={d.month}>
                <rect 
                  x={xSection - barWidth - 2} 
                  y={chartHeight - incomeH} 
                  width={barWidth} 
                  height={incomeH} 
                  fill="#34d399" 
                  rx="4"
                  opacity="0.9"
                />
                <rect 
                  x={xSection + 2} 
                  y={chartHeight - spendH} 
                  width={barWidth} 
                  height={spendH} 
                  fill="#818cf8" 
                  rx="4"
                  opacity="0.9"
                />
                <text 
                  x={xSection} 
                  y={viewBoxHeight - 10} 
                  textAnchor="middle" 
                  fill="#94a3b8" 
                  fontSize="24"
                >
                  {d.month}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
