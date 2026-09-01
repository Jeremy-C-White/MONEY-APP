import { NormalizedTransaction } from './financial';

type CacheEntry = {
  transactions: NormalizedTransaction[];
  timestamp: number;
};

class DashboardCache {
  private cache: Map<string, CacheEntry> = new Map();
  // 5 minutes TTL
  private readonly TTL_MS = 5 * 60 * 1000;

  get(userId: string): NormalizedTransaction[] | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(userId);
      return null;
    }

    return entry.transactions;
  }

  set(userId: string, transactions: NormalizedTransaction[]): void {
    this.cache.set(userId, {
      transactions,
      timestamp: Date.now()
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}

export const dashboardCache = new DashboardCache();
