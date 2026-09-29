/**
 * The battle's only source of chance: mulberry32, seeded with a 32-bit integer.
 *
 * Small, fast, and — the property that matters — nothing in it depends on the runtime. It is
 * integer arithmetic through `Math.imul` and `>>>`, which V8, JavaScriptCore and workerd all
 * agree on bit for bit, so the same seed walks the same sequence in a browser and on a Worker.
 * `Math.random()` would not, and nothing in the engine is allowed to call it.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [0, bound). */
  int(bound: number): number {
    return Math.floor(this.next() * bound);
  }

  /** One element, or undefined from an empty list. Draws nothing when there is no choice to make. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length <= 1) return items[0];
    return items[this.int(items.length)];
  }

  /**
   * Up to `count` different elements, in the order drawn. A partial Fisher–Yates on a copy, so the
   * caller's list is untouched, and asking for all of them is a shuffle.
   */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const take = Math.min(count, pool.length);
    for (let index = 0; index < take; index++) {
      const swap = index + this.int(pool.length - index);
      [pool[index], pool[swap]] = [pool[swap], pool[index]];
    }
    return pool.slice(0, take);
  }
}

/** A fresh seed for a new fight. The one place chance is allowed in — before the battle, not in it. */
export function randomSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0];
}
