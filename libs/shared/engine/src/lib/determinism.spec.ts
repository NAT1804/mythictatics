import { MatchSetupSchema } from '@mythictatics/shared/contracts/schemas';
import { compOpponent, opponentRng, randomOpponent } from './opponents';
import { Rng } from './rng';
import { ENGINE_VERSION } from './rules';
import { createCardLookup, hashEvents, matchSetup, sideFromBuild, simulate } from './simulate';
import { datasetCards } from '../testing/fixtures';

/**
 * The property everything else rests on: a setup is a replay. Fight it twice, anywhere, and the
 * log is the same event for event.
 */

const { comps, lookup } = datasetCards();

/**
 * One fixed battle and the fingerprint of its log. The web e2e test fights the same setup in a
 * real browser and checks it prints this same hash — node and the browser agreeing is the
 * acceptance test for Phase 1. A change to the rules changes it; update both together, and move
 * `ENGINE_VERSION` when the change is to how battles resolve.
 */
export const GOLDEN_SEED = 20260929;
export const GOLDEN_HASH = '843cd1d7';

/**
 * The player's side is the Arsonist comp's board at Rank 2, as a builder share link would carry it;
 * the AI fields the Masochist comp at level 1 — exactly what `/battle` builds from
 * `?d=<arsonist>&vs=masochist&seed=GOLDEN_SEED` (level 1 is the default).
 */
function goldenSetup() {
  const arsonist = comps.find((comp) => comp.slug === 'arsonist')!;
  const masochist = comps.find((comp) => comp.slug === 'masochist')!;
  const board = arsonist.idealBoard.map((slot) => slot && { ...slot, rank: 1 as const });
  const player = sideFromBuild({ board, patronGodId: null });
  // `lv=1` is Rank 1, which is rank index 0.
  const ai = compOpponent(masochist, lookup, 0, opponentRng(GOLDEN_SEED));
  return matchSetup(GOLDEN_SEED, [player, ai]);
}

describe('determinism', () => {
  it('fights the same setup to the same log, event for event', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rng = opponentRng(seed);
      const setup = matchSetup(seed, [
        randomOpponent(lookup, 1, rng),
        randomOpponent(lookup, 2, rng),
      ]);
      expect(simulate(setup, lookup).events).toEqual(
        simulate(structuredClone(setup), lookup).events,
      );
    }
  });

  it('draws the same random opponent from the same seed', () => {
    expect(randomOpponent(lookup, 0, opponentRng(9))).toEqual(
      randomOpponent(lookup, 0, opponentRng(9)),
    );
  });

  it('changes the fight when the seed changes', () => {
    const logs = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const rng = new Rng(1);
      const sides = [randomOpponent(lookup, 1, rng), randomOpponent(lookup, 1, rng)] as const;
      logs.add(hashEvents(simulate(matchSetup(seed, sides), lookup).events));
    }
    expect(logs.size).toBeGreaterThan(1);
  });

  it('does not depend on the order the cards were handed over in', () => {
    const { units, gods } = datasetCards();
    const reversed = createCardLookup([...units].reverse(), [...gods].reverse());
    for (let seed = 1; seed <= 20; seed++) {
      const draw = (cards: typeof lookup) => {
        const rng = opponentRng(seed);
        return simulate(
          matchSetup(seed, [randomOpponent(cards, 1, rng), randomOpponent(cards, 1, rng)]),
          cards,
        );
      };
      expect(hashEvents(draw(reversed).events)).toBe(hashEvents(draw(lookup).events));
    }
  });

  it('keeps the golden battle on its fingerprint', () => {
    expect(hashEvents(simulate(goldenSetup(), lookup).events)).toBe(GOLDEN_HASH);
  });

  it('writes setups the contract accepts, and refuses one for other rules', () => {
    const setup = goldenSetup();
    expect(MatchSetupSchema.safeParse(setup).success).toBe(true);
    expect(() => simulate({ ...setup, engineVersion: '0.0.1' }, lookup)).toThrow(ENGINE_VERSION);
  });
});

describe('Rng', () => {
  it('walks the mulberry32 sequence', () => {
    const rng = new Rng(1);
    // Known first outputs of mulberry32(1), so a "harmless" refactor cannot drift the sequence.
    expect([rng.next(), rng.next(), rng.next()].map((value) => value.toFixed(8))).toEqual([
      '0.62707394',
      '0.00273572',
      '0.52744704',
    ]);
  });

  it('samples without repeats and leaves its input alone', () => {
    const items = [1, 2, 3, 4, 5];
    const drawn = new Rng(5).sample(items, 3);
    expect(new Set(drawn).size).toBe(3);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });
});
