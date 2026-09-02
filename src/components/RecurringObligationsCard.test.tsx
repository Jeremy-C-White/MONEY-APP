// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecurringObligationsCard } from './RecurringObligationsCard';
import type { RecurringObligationsResponse } from '../types/finance';

const report: RecurringObligationsResponse = {
  estimatedMonthlyTotal: 336.67,
  analyzedThrough: '2026-09-01',
  obligations: [
    {
      merchant: 'Lawnstarter',
      category: 'HOME_IMPROVEMENT',
      cadence: 'weekly',
      confidence: 'high',
      typicalCharge: 50,
      estimatedMonthlyAmount: 216.67,
      occurrenceCount: 8,
      lastChargeDate: '2026-08-26',
    },
    {
      merchant: 'Verizon',
      category: 'RENT_AND_UTILITIES',
      cadence: 'monthly',
      confidence: 'medium',
      typicalCharge: 120,
      estimatedMonthlyAmount: 120,
      occurrenceCount: 4,
      lastChargeDate: '2026-08-15',
    },
  ],
};

describe('RecurringObligationsCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    // @ts-ignore React act environment flag used by the existing native test setup.
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('labels the estimate as likely and explains that it does not alter totals', () => {
    act(() => root.render(<RecurringObligationsCard report={report} />));

    expect(container.textContent).toContain('Likely recurring');
    expect(container.textContent).toContain('$336.67');
    expect(container.textContent).toContain('not confirmed bills');
    expect(container.textContent).toContain('do not change your financial totals');
    expect(container.textContent).toContain('Lawnstarter');
    expect(container.textContent).toContain('Weekly');
    expect(container.textContent).toContain('Verizon');
    expect(container.textContent).toContain('Monthly');
  });

  it('shows a neutral empty state when no stable pattern is detected', () => {
    act(() => root.render(
      <RecurringObligationsCard report={{
        obligations: [],
        estimatedMonthlyTotal: 0,
        analyzedThrough: '2026-09-01',
      }} />
    ));

    expect(container.textContent).toContain('No stable recurring charges detected yet.');
  });
});
