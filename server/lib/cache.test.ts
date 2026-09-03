import { describe, expect, it, vi } from 'vitest';
import type { NormalizedTransaction } from './financial';
import { DashboardCache } from './cache';

const transactions = [{ transactionId: 'tx-1' }] as NormalizedTransaction[];

describe('DashboardCache', () => {
  it('reuses a cached result until its TTL expires', async () => {
    let now = 1_000;
    const cache = new DashboardCache(100, () => now);
    const loader = vi.fn().mockResolvedValue(transactions);

    await expect(cache.getOrLoad('user-1', loader)).resolves.toBe(transactions);
    now = 1_050;
    await expect(cache.getOrLoad('user-1', loader)).resolves.toBe(transactions);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous loads for the same user', async () => {
    const cache = new DashboardCache();
    let finishLoad: (value: NormalizedTransaction[]) => void = () => undefined;
    const loader = vi.fn(() => new Promise<NormalizedTransaction[]>(resolve => {
      finishLoad = resolve;
    }));

    const first = cache.getOrLoad('user-1', loader);
    const second = cache.getOrLoad('user-1', loader);
    finishLoad(transactions);

    await expect(Promise.all([first, second])).resolves.toEqual([
      transactions,
      transactions,
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('allows a failed load to be retried', async () => {
    const cache = new DashboardCache();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(transactions);

    await expect(cache.getOrLoad('user-1', loader)).rejects.toThrow('temporary failure');
    await expect(cache.getOrLoad('user-1', loader)).resolves.toBe(transactions);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not cache a load invalidated while it is running', async () => {
    const cache = new DashboardCache();
    let finishFirstLoad: (value: NormalizedTransaction[]) => void = () => undefined;
    const firstLoader = vi.fn(() => new Promise<NormalizedTransaction[]>(resolve => {
      finishFirstLoad = resolve;
    }));
    const replacement = [{ transactionId: 'tx-2' }] as NormalizedTransaction[];
    const secondLoader = vi.fn().mockResolvedValue(replacement);

    const first = cache.getOrLoad('user-1', firstLoader);
    cache.invalidate('user-1');
    await expect(cache.getOrLoad('user-1', secondLoader)).resolves.toBe(replacement);
    finishFirstLoad(transactions);
    await expect(first).resolves.toBe(transactions);

    expect(cache.get('user-1')).toBe(replacement);
  });
});
