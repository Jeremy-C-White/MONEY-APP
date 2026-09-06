// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SafeToSpend } from '../types/finance';
import { SafeToSpendCard } from './SafeToSpendCard';

function safeToSpend(overrides: Partial<SafeToSpend> = {}): SafeToSpend {
  return {
    status: 'ready',
    asOfDate: '2026-09-06',
    throughDate: '2026-09-30',
    currency: 'USD',
    cashBasis: 'available',
    cashOnHand: 4000,
    cashAccountCount: 2,
    billsDue: 2180,
    pendingOutflow: 250,
    buffer: 0,
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
        deductionId: 'pending:txn-1',
        kind: 'pending',
        label: 'Lowes',
        amount: 250,
        date: '2026-09-05',
        accountName: 'Rewards Card ••••9876',
      },
    ],
    pendingReflectedInBalance: false,
    blockers: [],
    warning: null,
    ...overrides,
  };
}

describe('SafeToSpendCard', () => {
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

  it('leads with the figure and names the deductions behind it', () => {
    act(() => root.render(<SafeToSpendCard safeToSpend={safeToSpend()} />));

    expect(container.textContent).toContain('Safe to spend');
    expect(container.textContent).toContain('$1,570.00');
    expect(container.textContent).toContain(
      'From $4,000.00 in cash, after $2,180.00 in bills due by Sep 30 and $250.00 pending.'
    );
    expect(container.textContent).toContain('Expected income before Sep 30 is not counted.');
  });

  it('keeps the itemized deductions behind a disclosure until asked', () => {
    act(() => root.render(<SafeToSpendCard safeToSpend={safeToSpend()} />));
    expect(container.textContent).not.toContain('Brookwood Preschool');

    const toggle = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
    act(() => toggle.click());

    expect(container.textContent).toContain('Brookwood Preschool');
    expect(container.textContent).toContain('Bill due · Sep 12 · Checking ••••1234');
    expect(container.textContent).toContain('Pending charge · Sep 5 · Rewards Card ••••9876');
    expect(container.textContent).toContain('Cash across 2 accounts$4,000.00');
    expect(container.textContent).toContain('−$1,800.00');
  });

  it('shows the buffer as its own deduction', () => {
    act(() => root.render(<SafeToSpendCard safeToSpend={safeToSpend({
      buffer: 250,
      amount: 1320,
      deductions: [
        ...safeToSpend().deductions,
        {
          deductionId: 'buffer',
          kind: 'buffer',
          label: 'Buffer you set aside',
          amount: 250,
          date: null,
          accountName: null,
        },
      ],
    })} />));

    expect(container.textContent).toContain('your $250.00 buffer');
    act(() => (container.querySelector('button[aria-expanded]') as HTMLButtonElement).click());
    expect(container.textContent).toContain('Buffer you set aside');
    expect(container.textContent).toContain('Your buffer');
  });

  it('explains why the figure is withheld instead of showing a number', () => {
    act(() => root.render(<SafeToSpendCard safeToSpend={safeToSpend({
      status: 'unavailable',
      cashBasis: null,
      cashOnHand: null,
      billsDue: null,
      pendingOutflow: null,
      amount: null,
      deductions: [],
      blockers: ['stale_cash_balance'],
      warning: 'Cash balances are older than a successful sync, so this figure is withheld.',
    })} />));

    expect(container.textContent).toContain('Safe to spend is unavailable');
    expect(container.textContent).toContain('older than a successful sync');
    expect(container.textContent).not.toContain('$');
  });

  it('flags a shortfall when commitments exceed the cash on hand', () => {
    act(() => root.render(<SafeToSpendCard safeToSpend={safeToSpend({
      cashOnHand: 200,
      amount: -1600,
    })} />));

    expect(container.textContent).toContain('-$1,600.00');
    expect(container.textContent).toContain('exceed');
    expect(container.textContent).toContain('the cash on hand');
  });

  it('notes when the available balance already withholds pending charges', () => {
    act(() => root.render(<SafeToSpendCard safeToSpend={safeToSpend({
      pendingReflectedInBalance: true,
      pendingOutflow: 0,
      amount: 1820,
    })} />));

    expect(container.textContent).toContain('already withholds pending');
  });
});
