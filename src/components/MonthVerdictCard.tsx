import React from 'react';
import { Minus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { OverviewVerdicts, VerdictTone } from '../types/finance';
import {
  describeCategoryDriver,
  describeCompletedMonth,
  describeMonthProgress,
  describePacing,
  describeTargetProgress,
} from '../lib/verdict-language';

const TONE_TEXT: Record<VerdictTone, string> = {
  positive: 'text-emerald-700',
  caution: 'text-rose-700',
  neutral: 'text-slate-700',
};

function ToneIcon({ tone }: { tone: VerdictTone }) {
  if (tone === 'positive') return <TrendingDown className="h-4 w-4 text-emerald-500" />;
  if (tone === 'caution') return <TrendingUp className="h-4 w-4 text-rose-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

export function MonthVerdictCard({
  verdicts,
  loading,
  onSetTarget,
}: {
  verdicts: OverviewVerdicts | null;
  loading?: boolean;
  onSetTarget?: () => void;
}) {
  if (loading && !verdicts) {
    return <div className="mb-8 h-40 animate-pulse rounded-2xl bg-slate-100" />;
  }
  if (!verdicts) return null;

  const { monthProgress, lastCompletedMonth, pacing, categoryDrivers, targetProgress } = verdicts;

  return (
    <section className="mb-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <p className={`text-lg font-semibold ${TONE_TEXT[monthProgress.tone]}`}>
        {describeMonthProgress(monthProgress)}
      </p>

      {pacing && (
        <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
          <span className="mt-0.5 flex-shrink-0">
            <ToneIcon tone={pacing.tone} />
          </span>
          <span>{describePacing(pacing)}</span>
        </p>
      )}

      {targetProgress ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
          <Target className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>{describeTargetProgress(targetProgress)}</span>
        </p>
      ) : onSetTarget ? (
        <p className="mt-2 text-sm text-slate-500">
          No monthly target set, so &ldquo;on track&rdquo; can&rsquo;t be answered.{' '}
          <button
            type="button"
            onClick={onSetTarget}
            className="font-medium text-indigo-600 underline transition-colors hover:text-indigo-800"
          >
            Set one
          </button>
          .
        </p>
      ) : null}

      {lastCompletedMonth && (
        <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
          {describeCompletedMonth(lastCompletedMonth)}
        </p>
      )}

      {categoryDrivers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {categoryDrivers.map(driver => (
            <li key={driver.category} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-0.5 flex-shrink-0">
                <ToneIcon tone={driver.tone} />
              </span>
              <span>{describeCategoryDriver(driver)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
