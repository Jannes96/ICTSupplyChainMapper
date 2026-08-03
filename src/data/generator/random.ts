/**
 * Seeded pseudo random number generator (mulberry32).
 *
 * `Math.random()` would make generated fixtures irreproducible, and a test that
 * fails only every other run is worse than no test. Same seed, same register.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() called on an empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swap = this.int(0, index);
      [result[index], result[swap]] = [result[swap] as T, result[index] as T];
    }
    return result;
  }

  bool(probability: number): boolean {
    return this.next() < probability;
  }
}
