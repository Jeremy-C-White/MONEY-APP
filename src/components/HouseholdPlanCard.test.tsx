// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdPlanCard } from './HouseholdPlanCard';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

describe('HouseholdPlanCard', () => {
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

  function fields() {
    return {
      buffer: container.querySelector('#safe-to-spend-buffer') as HTMLInputElement,
      target: container.querySelector('#monthly-spending-target') as HTMLInputElement,
      save: [...container.querySelectorAll('button')]
        .find(button => button.textContent?.includes('Save plan')) as HTMLButtonElement,
    };
  }

  function setValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('loads the stored plan into the form', async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      jsonResponse({ householdPlan: { safeToSpendBuffer: 250, monthlySpendingTarget: 5000 } })
    );

    await act(async () => { root.render(<HouseholdPlanCard apiFetch={apiFetch} />); });
    await flush();

    expect(fields().buffer.value).toBe('250');
    expect(fields().target.value).toBe('5000');
    expect(container.textContent).toContain('Buffer $250.00 · Target $5,000.00');
  });

  it('sends a blank target as null rather than zero', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({ householdPlan: { safeToSpendBuffer: 0, monthlySpendingTarget: 5000 } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ householdPlan: { safeToSpendBuffer: 0, monthlySpendingTarget: null } })
      );

    await act(async () => { root.render(<HouseholdPlanCard apiFetch={apiFetch} />); });
    await flush();

    act(() => setValue(fields().target, ''));
    await act(async () => { fields().save.click(); });
    await flush();

    expect(JSON.parse(apiFetch.mock.calls[1][1].body)).toEqual({
      safeToSpendBuffer: 0,
      monthlySpendingTarget: null,
    });
    expect(container.textContent).toContain('Target none');
  });

  it('rejects a negative buffer before sending it', async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      jsonResponse({ householdPlan: { safeToSpendBuffer: 0, monthlySpendingTarget: null } })
    );

    await act(async () => { root.render(<HouseholdPlanCard apiFetch={apiFetch} />); });
    await flush();

    act(() => setValue(fields().buffer, '-10'));
    await act(async () => { fields().save.click(); });
    await flush();

    expect(container.textContent).toContain('The buffer must be zero or more.');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('surfaces a rejection from the server', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({ householdPlan: { safeToSpendBuffer: 0, monthlySpendingTarget: null } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'monthlySpendingTarget must be between 0.01 and 1000000.' }, false)
      );

    await act(async () => { root.render(<HouseholdPlanCard apiFetch={apiFetch} />); });
    await flush();

    act(() => setValue(fields().target, '9999999'));
    await act(async () => { fields().save.click(); });
    await flush();

    expect(container.textContent).toContain('must be between 0.01 and 1000000');
  });
});
