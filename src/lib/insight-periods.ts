import type { WalmartInsightPeriod } from '../types/finance';

export const INSIGHT_PERIOD_OPTIONS: ReadonlyArray<{
  value: WalmartInsightPeriod;
  label: string;
}> = [
  { value: 'last_7_days', label: '7D' },
  { value: 'last_30_days', label: '30D' },
  { value: 'last_3_months', label: '3M' },
  { value: 'last_12_months', label: '12M' },
];
