// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SafeToSpend } from '../types/finance';
import { UpcomingCommitmentsCard } from './UpcomingCommitmentsCard';

function safeToSpend(overrides: Partial<SafeToSpend> = {}): SafeToSpend {
  return {
    status: 'ready',
    asOfDate: '2026-09-06',
    throughDate: '2026-09-30',
    currency: 'USD',
    cashBasis: 'available',
    cashOnHand: 4000,
    cashAccountCount: 1,
    excludedCashAccountCount: 0,
    unassignedCashAccountCount: 0,
    billsDue: 2180,
    pendingOutflow: 0,
    buffer: 250,
    amount: 1570,
    deductions: [
      {
        deductionId: 'bill:preschool:2026-09-12',
        kind: 'bill',
        label: 'Brookwood Preschool',
        amount: 1800,
        date: '2026-09-12',
        accountName: 'Checking ••••1234',
      },
      {
        deductionId: 'bill:verizon:2026-09-20',
        kind: 'bill',
        label: 'Verizon',
        amount: 380,
        date: '2026-09-20',
        accountName: null,
      },
      {
        deductionId: 'buffer',
        kind: 'buffer',
        label: 'Buffer you set aside',
        amount: 250,
        date: null,
        accountName: null,
      },
    ],
    pendingReflectedInBalance: true,
    blockers: [],
    warning: null,
    ...overrides,
  };
}

describe('UpcomingCommitmentsCard', () => {
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

  it('lists confirmed charges with their dates and total', () => {
    act(() => root.render(<UpcomingCommitmentsCard safeToSpend={safeToSpend()} />));

    expect(container.textContent).toContain('Still coming');
    expect(container.textContent).toContain('$2,180.00 through Sep 30');
    expect(container.textContent).toContain('Brookwood Preschool');
    expect(container.textContent).toContain('Sep 12 · Checking ••••1234');
    expect(container.textContent).toContain('Verizon');
  });

  it('leaves the buffer out of the forward list', () => {
    act(() => root.render(<UpcomingCommitmentsCard safeToSpend={safeToSpend()} />));
    expect(container.textContent).not.toContain('Buffer you set aside');
  });

  it('says plainly when nothing is due', () => {
    act(() => root.render(<UpcomingCommitmentsCard safeToSpend={safeToSpend({
      deductions: [],
      billsDue: 0,
    })} />));

    expect(container.textContent).toContain(
      'No confirmed recurring charges are due before Sep 30.'
    );
  });
});
