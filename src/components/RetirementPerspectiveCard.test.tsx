// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FinancialPosition } from '../types/finance';
import { RetirementPerspectiveCard } from './RetirementPerspectiveCard';

describe('RetirementPerspectiveCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows retirement totals, net-worth share, trend, and contribution limits', () => {
    const position: FinancialPosition = {
      currency: 'USD', mixedCurrency: false, liquidCash: 10000, liquidSavings: 4000,
      estimatedNetWorth: 50000, includedAccountCount: 3, knownBalanceCount: 3,
      excludedDuplicateCount: 0,
      retirement: {
        total: 30000, accountCount: 1, knownBalanceCount: 1, shareOfNetWorth: 0.6,
        history: [{ date: '2026-08-01', total: 28000 }, { date: '2026-09-01', total: 30000 }],
        trend: {
          startDate: '2026-08-01', endDate: '2026-09-01', change: 2000,
          percentageChange: 2000 / 28000,
        },
        contributionDataAvailable: false,
      },
    };

    act(() => root.render(<RetirementPerspectiveCard position={position} />));
    expect(container.textContent).toContain('Retirement perspective');
    expect(container.textContent).toContain('$30,000.00');
    expect(container.textContent).toContain('60%');
    expect(container.textContent).toContain('+$2,000.00');
    expect(container.textContent).toContain('never enter Safe to Spend');
    expect(container.textContent).toContain('not available from the current balance feed');
  });
});
