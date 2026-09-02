// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatCompactCurrency, TrendChart } from './TrendChart';

describe('TrendChart', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    // @ts-ignore React act environment flag used by the existing native test setup.
    global.IS_REACT_ACT_ENVIRONMENT = true;
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('formats readable currency-axis labels', () => {
    expect(formatCompactCurrency(0)).toBe('$0');
    expect(formatCompactCurrency(1250)).toBe('$1.3k');
    expect(formatCompactCurrency(-12500)).toBe('-$12.5k');
    expect(formatCompactCurrency(1_500_000)).toBe('$1.5M');
  });

  it('includes exact income, spending, and net values in an accessible table', () => {
    act(() => {
      root.render(
        <TrendChart data={[{
          month: '2026-08',
          income: 5000,
          spending: 3200,
          netCashFlow: 1800,
        }]} />
      );
    });

    expect(container.getAttribute('role')).toBeNull();
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('net cash flow');
    expect(container.textContent).toContain('August 2026');
    expect(container.textContent).toContain('$5,000.00');
    expect(container.textContent).toContain('$3,200.00');
    expect(container.textContent).toContain('$1,800.00');
  });

  it('renders a clear empty state', () => {
    act(() => root.render(<TrendChart data={[]} />));
    expect(container.textContent).toContain('No trend data available');
  });
});
