// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringObligationsCard } from './RecurringObligationsCard';
import type { RecurringObligationsResponse } from '../types/finance';

const report: RecurringObligationsResponse = {
  estimatedMonthlyTotal: 336.67,
  confirmedMonthlyTotal: 120,
  suggestionCount: 1,
  analyzedThrough: '2026-09-01',
  forecast: [
    { month: '2026-09', confirmedAmount: 120, obligationCount: 1 },
    { month: '2026-10', confirmedAmount: 120, obligationCount: 1 },
  ],
  obligations: [
    {
      obligationId: '111111111111111111111111',
      merchant: 'Lawnstarter',
      category: 'HOME_IMPROVEMENT',
      cadence: 'weekly',
      confidence: 'high',
      typicalCharge: 50,
      estimatedMonthlyAmount: 216.67,
      occurrenceCount: 8,
      lastChargeDate: '2026-08-26',
      status: 'suggested',
      expectedMonthlyAmount: 216.67,
      seasonStartMonth: null,
      seasonEndMonth: null,
      note: null,
      detected: true,
    },
    {
      obligationId: '222222222222222222222222',
      merchant: 'Verizon',
      category: 'RENT_AND_UTILITIES',
      cadence: 'monthly',
      confidence: 'medium',
      typicalCharge: 120,
      estimatedMonthlyAmount: 120,
      occurrenceCount: 4,
      lastChargeDate: '2026-08-15',
      status: 'confirmed',
      expectedMonthlyAmount: 120,
      seasonStartMonth: null,
      seasonEndMonth: null,
      note: 'Phone service',
      detected: true,
    },
  ],
};

function apiResponse(data: unknown = {}, ok = true): Response {
  return { ok, json: async () => data } as Response;
}

describe('RecurringObligationsCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let apiFetch: ReturnType<typeof vi.fn<(
    endpoint: string,
    options?: RequestInit
  ) => Promise<Response>>>;
  let onChanged: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    // @ts-ignore React act environment flag used by the existing native test setup.
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiFetch = vi.fn(async () => apiResponse());
    onChanged = vi.fn(async () => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderCard(value: RecurringObligationsResponse = report) {
    act(() => root.render(
      <RecurringObligationsCard
        report={value}
        apiFetch={apiFetch}
        onChanged={onChanged}
      />
    ));
  }

  it('separates confirmed totals from detector suggestions and shows the forecast', () => {
    renderCard();

    expect(container.textContent).toContain('Recurring services');
    expect(container.textContent).toContain('1 to review');
    expect(container.textContent).toContain('$120.00');
    expect(container.textContent).toContain('Detector suggested $336.67');
    expect(container.textContent).toContain('Six-month confirmed forecast');
    expect(container.textContent).toContain('Planning choices never change your actual transaction totals');
  });

  it('confirms a suggestion with its detected monthly estimate', async () => {
    renderCard();
    const confirm = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Confirm');

    await act(async () => confirm?.click());

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/recurring-obligations/111111111111111111111111',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = JSON.parse(String(apiFetch.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      status: 'confirmed',
      expectedMonthlyAmount: 216.67,
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('opens seasonal controls with editable start and end months', () => {
    renderCard();
    const seasonal = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Seasonal');
    act(() => seasonal?.click());

    expect(container.textContent).toContain('Expected monthly amount');
    expect(container.textContent).toContain('Starts');
    expect(container.textContent).toContain('Ends');
    const selects = container.querySelectorAll('select');
    expect(selects).toHaveLength(3);
    expect((selects[1] as HTMLSelectElement).value).toBe('3');
    expect((selects[2] as HTMLSelectElement).value).toBe('11');
  });

  it('persists a not-recurring decision and can reset reviewed services', async () => {
    renderCard();
    const dismiss = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Not recurring');
    await act(async () => dismiss?.click());
    expect(JSON.parse(String(apiFetch.mock.calls[0][1]?.body)).status).toBe('dismissed');

    apiFetch.mockClear();
    const reset = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Reset'));
    await act(async () => reset?.click());
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/recurring-obligations/222222222222222222222222',
      { method: 'DELETE' }
    );
  });

  it('shows a neutral empty state when no stable pattern is detected', () => {
    renderCard({
      obligations: [],
      estimatedMonthlyTotal: 0,
      confirmedMonthlyTotal: 0,
      suggestionCount: 0,
      analyzedThrough: '2026-09-01',
      forecast: [],
    });

    expect(container.textContent).toContain('No stable recurring charges detected yet.');
  });
});
