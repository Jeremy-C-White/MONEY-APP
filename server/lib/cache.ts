import { NormalizedTransaction } from './financial';

type CacheEntry = {
  transactions: NormalizedTransaction[];
  timestamp: number;
};

export class DashboardCache {
  private cache: Map<string, CacheEntry> = new Map();
  private inFlight: Map<string, Promise<NormalizedTransaction[]>> = new Map();
  private generations: Map<string, number> = new Map();

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly now = () => Date.now()
  ) {}

  get(userId: string): NormalizedTransaction[] | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (this.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(userId);
      return null;
    }

    return entry.transactions;
  }

  set(userId: string, transactions: NormalizedTransaction[]): void {
    this.cache.set(userId, {
      transactions,
      timestamp: this.now()
    });
  }

  async getOrLoad(
    userId: string,
    loader: () => Promise<NormalizedTransaction[]>
  ): Promise<NormalizedTransaction[]> {
    const cached = this.get(userId);
    if (cached) return cached;

    const activeLoad = this.inFlight.get(userId);
    if (activeLoad) return activeLoad;

    const generation = this.generations.get(userId) || 0;
    const load = loader().then(transactions => {
      if ((this.generations.get(userId) || 0) === generation) {
        this.set(userId, transactions);
      }
      return transactions;
    });

    this.inFlight.set(userId, load);
    try {
      return await load;
    } finally {
      if (this.inFlight.get(userId) === load) {
        this.inFlight.delete(userId);
      }
    }
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
    this.inFlight.delete(userId);
    this.generations.set(userId, (this.generations.get(userId) || 0) + 1);
  }
}

export const dashboardCache = new DashboardCache();
