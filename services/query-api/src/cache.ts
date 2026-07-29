interface CacheEntry<T> {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
}

export class AsyncTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  public constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now
  ) {}

  public getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const current = this.entries.get(key);
    if (
      current?.value !== undefined &&
      current.expiresAt > this.now()
    ) {
      return Promise.resolve(current.value);
    }
    if (current?.pending) return current.pending;

    const pending = loader()
      .then((value) => {
        this.entries.set(key, {
          value,
          expiresAt: this.now() + this.ttlMs
        });
        return value;
      })
      .catch((error: unknown) => {
        this.entries.delete(key);
        throw error;
      });

    this.entries.set(key, { expiresAt: 0, pending });
    return pending;
  }

  public clear(): void {
    this.entries.clear();
  }
}
