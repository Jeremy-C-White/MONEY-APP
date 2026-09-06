import {
  formatCurrency,
  formatMonthLabel,
  formatPercentagePoints,
  getCategoryLabel,
} from './formatters';
import type {
  CategoryDriverVerdict,
  CompletedMonthVerdict,
  MonthProgressVerdict,
  PacingVerdict,
  SafeToSpend,
  SpendingTargetProgress,
} from '../types/finance';

/**
 * Turns the server's structured verdicts into the sentences the Overview
 * shows. This is formatting and wording only — every figure and every
 * comparison arrives already decided by the server.
 */

export function describeMonthProgress(verdict: MonthProgressVerdict): string {
  const month = formatMonthLabel(verdict.month);
  const kept = formatCurrency(Math.abs(verdict.netCashFlow));

  if (verdict.netCashFlow > 0) return `${month} so far: you've kept ${kept}.`;
  if (verdict.netCashFlow < 0) return `${month} so far: you're ${kept} behind.`;
  return `${month} so far: income and spending are even.`;
}

export function describeCompletedMonth(verdict: CompletedMonthVerdict): string {
  const month = formatMonthLabel(verdict.month);
  const amount = formatCurrency(Math.abs(verdict.netCashFlow));
  const result = verdict.netCashFlow >= 0
    ? `you kept ${amount}`
    : `you spent ${amount} more than you brought in`;

  if (verdict.rank === 'best') {
    return `${month}: ${result} — your best month in ${verdict.comparedMonthCount}.`;
  }
  if (verdict.rank === 'tightest') {
    return `${month}: ${result} — your tightest month in ${verdict.comparedMonthCount}.`;
  }
  if (verdict.difference != null && verdict.previousMonth) {
    const swing = formatCurrency(Math.abs(verdict.difference));
    const direction = verdict.difference >= 0 ? 'better' : 'worse';
    return `${month}: ${result} — ${swing} ${direction} than ${formatMonthLabel(verdict.previousMonth)}.`;
  }
  return `${month}: ${result}.`;
}

export function describePacing(verdict: PacingVerdict): string {
  if (verdict.direction === 'level') {
    return `You're spending at about the same pace as last month at day ${verdict.dayOfMonth}.`;
  }

  const amount = formatCurrency(Math.abs(verdict.spendingDifference));
  const direction = verdict.direction === 'ahead' ? 'ahead of' : 'behind';
  const percentage = verdict.spendingPercentageChange != null
    ? ` (${formatPercentagePoints(Math.abs(verdict.spendingPercentageChange))})`
    : '';
  const driver = verdict.driver
    ? `, mostly ${getCategoryLabel(verdict.driver.category)}`
    : '';

  return `About ${amount}${percentage} ${direction} last month at day ${verdict.dayOfMonth}${driver}.`;
}

export function describeCategoryDriver(verdict: CategoryDriverVerdict): string {
  const category = getCategoryLabel(verdict.category);
  const current = formatCurrency(verdict.currentSpending);
  const previous = formatCurrency(verdict.previousSpending);

  if (verdict.movement === 'new') return `${category} went from nothing to ${current}.`;
  if (verdict.movement === 'stopped') return `${category} went from ${previous} to nothing.`;
  return `${category} went from ${previous} to ${current}.`;
}

export function describeTargetProgress(progress: SpendingTargetProgress): string {
  const target = formatCurrency(progress.target);
  const projected = formatCurrency(progress.projectedMonthEndSpending);
  const gap = formatCurrency(Math.abs(progress.projectedDifference));

  if (progress.verdict === 'over') {
    return `Tracking to ${projected} against your ${target} target — ${gap} over.`;
  }
  if (progress.verdict === 'under') {
    return `Tracking to ${projected} against your ${target} target — ${gap} under.`;
  }
  return `Tracking to ${projected} against your ${target} target — on track.`;
}

/**
 * The one-line explanation under the safe-to-spend figure. It names the
 * deductions rather than only the result, so the number can be audited.
 */
export function describeSafeToSpend(safeToSpend: SafeToSpend): string {
  if (safeToSpend.status !== 'ready') {
    return safeToSpend.warning || 'Not enough fresh balance data to show a figure.';
  }

  const parts: string[] = [];
  if (safeToSpend.billsDue) {
    parts.push(`${formatCurrency(safeToSpend.billsDue)} in bills due by ${describeThroughDate(safeToSpend.throughDate)}`);
  }
  if (safeToSpend.pendingOutflow) {
    parts.push(`${formatCurrency(safeToSpend.pendingOutflow)} pending`);
  }
  if (safeToSpend.buffer) {
    parts.push(`your ${formatCurrency(safeToSpend.buffer)} buffer`);
  }

  const cash = formatCurrency(safeToSpend.cashOnHand);
  if (!parts.length) {
    return `From ${cash} in cash, with nothing else committed before ${describeThroughDate(safeToSpend.throughDate)}.`;
  }
  return `From ${cash} in cash, after ${joinClauses(parts)}.`;
}

export function describeThroughDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function joinClauses(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
