import type { SideIndex } from '@mythictatics/shared/contracts';

export function other(side: SideIndex): SideIndex {
  return side === 0 ? 1 : 0;
}

/** The lowest by `score`, ties to the first — which, in a slot-ordered list, is the lower slot. */
export function lowest<T>(items: readonly T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  for (const item of items) if (best === null || score(item) < score(best)) best = item;
  return best;
}

/** The highest by `score`, ties to the first. */
export function highest<T>(items: readonly T[], score: (item: T) => number): T | null {
  return lowest(items, (item) => -score(item));
}
