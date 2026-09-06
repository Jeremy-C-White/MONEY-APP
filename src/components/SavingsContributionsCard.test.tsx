// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavingsContributionsResponse, SavingsDestination } from '../types/finance';
import { SavingsContributionsCard } from './SavingsContributionsCard';

function destination(overrides: Partial<SavingsDestination> = {}): SavingsDestination {
  return {
    key: '2400 fsaggtr03 investment',
    destinationId: 'a'.repeat(24),
    displayName: '2400 fsaggtr03 investment',
    isNamed: false,
    totalContributed: 18_400,
    contributionCount: 40,
    firstContribution: '2024-09-06',
    lastContribution: '2026-09-04',
    monthlyAverage: 760,
    currentMonthlyRate: 500,
    cadence: 'twice_monthly',
    status: 'active',
    monthlyHistory: [
      { month: '2026-05', amount: 1200, count: 2 },
      { month: '2026-06', amount: 1200, count: 2 },
      { month: '2026-07', amount: 500, count: 2 },
      { month: '2026-08', amount: 500, count: 2 },
    ],
    rateChange: null,
    mergedStreamCount: 1,
    streams: [{
      streamKey: '2400 fsaggtr03 investment',
      reference: null,
      totalContributed: 18_400,
      contributionCount: 40,
      firstContribution: '2024-09-06',
      lastContribution: '2026-09-04',
      typicalAmount: 250,
      currentMonthlyRate: 500,
      cadence: 'twice_monthly',
      status: 'active',
    }],
    ...overrides,
  };
}

function report(overrides: Partial<SavingsContributionsResponse> = {}): SavingsContributionsResponse {
  return {
    asOfDate: '2026-09-06',
    destinations: [destination()],
    totals: {
      totalContributed: 52_725,
      contributionCount: 118,
      monthlyAverage: 900,
      currentMonthlyRate: 1150,
      savingsRateOfIncome: 0.12,
      incomeConsidered: 57_500,
      incomeFromMonth: '2026-04',
    },
    ...overrides,
  };
}

describe('SavingsContributionsCard', () => {
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

  type ApiFetch = (endpoint: string, options?: RequestInit) => Promise<Response>;

  async function render(payload: unknown = report(), apiFetch?: ApiFetch) {
    const fetcher: ApiFetch = apiFetch || vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }) as Response);

    await act(async () => {
      root.render(<SavingsContributionsCard apiFetch={fetcher} refreshKey={0} />);
    });
    await act(async () => { await Promise.resolve(); });

    return fetcher;
  }

  it('leads with the monthly total and the savings rate', async () => {
    await render();
    expect(container.textContent).toContain('$1,150.00');
    expect(container.textContent).toContain('/ month');
    expect(container.textContent).toContain('12% of income');
  });

  it('omits the percentage entirely when the savings rate is unknown', async () => {
    await render(report({
      totals: { ...report().totals, savingsRateOfIncome: null },
    }));

    expect(container.textContent).toContain('$1,150.00');
    expect(container.textContent).not.toContain('of income');
    expect(container.textContent).not.toContain('0%');
  });

  it('shows a rate step-down on the row without expanding anything', async () => {
    await render(report({
      destinations: [destination({
        displayName: 'College Savings',
        isNamed: true,
        rateChange: { previousAmount: 600, currentAmount: 250, changedOnMonth: '2026-07' },
      })],
    }));

    expect(container.textContent).toContain(
      'was $600.00 until July 2026, now $250.00'
    );
  });

  it('renders an ended stream with its end date rather than hiding it', async () => {
    await render(report({
      destinations: [destination({
        key: '2400 fsagtr1213 investment',
        displayName: '2400 fsagtr1213 investment',
        destinationId: 'b'.repeat(24),
        status: 'ended',
        currentMonthlyRate: null,
        totalContributed: 2000,
        lastContribution: '2025-03-15',
      })],
    }));

    expect(container.textContent).toContain('2400 fsagtr1213 investment');
    expect(container.textContent).toContain('Ended March 2025');
    expect(container.textContent).toContain('$2,000.00 total');
    expect(container.textContent).toContain('No current rate');
    expect(container.querySelector('li')?.className).toContain('opacity-60');
  });

  it('discloses when one row combines several transfer streams', async () => {
    await render(report({
      destinations: [destination({
        mergedStreamCount: 2,
        streams: [
          { ...destination().streams[0], reference: '000000002102387', typicalAmount: 900, cadence: 'monthly' },
          { ...destination().streams[0], reference: '000000002088697', typicalAmount: 250, cadence: 'monthly' },
        ],
      })],
    }));

    expect(container.textContent).toContain('Combines 2 transfer streams');
    expect(container.textContent).toContain('$900.00 monthly and $250.00 monthly');
  });

  it('invites naming a destination that still shows its raw prefix', async () => {
    await render();
    expect(container.textContent).toContain('2400 fsaggtr03 investment');
    expect(container.textContent).toContain('Name this');
  });

  it('does not invite naming once the owner has named it', async () => {
    await render(report({
      destinations: [destination({ displayName: 'College Savings', isNamed: true })],
    }));
    expect(container.textContent).toContain('College Savings');
    expect(container.textContent).not.toContain('Name this');
  });

  it('renames inline and reloads so the new name appears', async () => {
    const named = report({
      destinations: [destination({ displayName: 'College Savings', isNamed: true })],
    });
    const apiFetch = vi.fn<ApiFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => report() } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ destinationId: 'a'.repeat(24), key: 'k', displayName: 'College Savings' }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => named } as Response);

    await render(undefined, apiFetch);

    const edit = container.querySelector('button[aria-label^="Rename"]') as HTMLButtonElement;
    await act(async () => { edit.click(); });

    const input = container.querySelector('input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    act(() => {
      setter?.call(input, 'College Savings');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const save = container.querySelector('button[aria-label="Save name"]') as HTMLButtonElement;
    await act(async () => { save.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(apiFetch).toHaveBeenNthCalledWith(2, `/api/savings/destinations/${'a'.repeat(24)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'College Savings' }),
    });
    expect(container.textContent).toContain('College Savings');
  });

  it('surfaces a rejected rename on the row and keeps the editor open', async () => {
    const apiFetch = vi.fn<ApiFetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => report() } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'displayName cannot be empty.' }),
      } as Response);

    await render(undefined, apiFetch);

    await act(async () => {
      (container.querySelector('button[aria-label^="Rename"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('button[aria-label="Save name"]') as HTMLButtonElement).click();
    });
    await act(async () => { await Promise.resolve(); });

    expect(container.textContent).toContain('displayName cannot be empty.');
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('says plainly when nothing has been contributed', async () => {
    await render(report({
      destinations: [],
      totals: {
        totalContributed: 0,
        contributionCount: 0,
        monthlyAverage: 0,
        currentMonthlyRate: null,
        savingsRateOfIncome: null,
        incomeConsidered: null,
        incomeFromMonth: null,
      },
    }));

    expect(container.textContent).toContain(
      'No transfers to savings or investment accounts have been recorded yet.'
    );
  });
});
