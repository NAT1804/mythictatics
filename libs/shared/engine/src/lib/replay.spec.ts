import { compOpponent, opponentRng, randomOpponent } from './opponents';
import { replayViews } from './replay';
import { matchSetup, simulate } from './simulate';
import { datasetCards } from '../testing/fixtures';

const { comps, lookup } = datasetCards();

/**
 * A renderer folds the log and must land on exactly the board the engine ended on — otherwise
 * the log is missing something the engine changed, and the screen would lie about the fight.
 */
describe('replayViews', () => {
  function expectFaithful(setup: ReturnType<typeof matchSetup>) {
    const result = simulate(setup, lookup);
    const last = replayViews(result.events).at(-1)!;
    for (const side of [0, 1] as const) {
      const standing = last.boards[side]
        .filter((uid): uid is number => uid !== null)
        .map((uid) => {
          const { dead: _dead, ...fighter } = last.fighters.get(uid)!;
          return { ...fighter, statuses: [...fighter.statuses].sort() };
        });
      const survivors = result.survivors[side].map((fighter) => ({
        ...fighter,
        statuses: [...fighter.statuses].sort(),
      }));
      expect(standing).toEqual(survivors);
    }
    expect(last.end).toEqual(result.events.at(-1));
  }

  it('ends on the survivors the engine reports, for every comp mirror', () => {
    for (const comp of comps) {
      const rng = opponentRng(3);
      expectFaithful(
        matchSetup(3, [compOpponent(comp, lookup, 1, rng), compOpponent(comp, lookup, 2, rng)]),
      );
    }
  });

  it('ends on the survivors the engine reports, for random boards', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = opponentRng(seed);
      expectFaithful(
        matchSetup(seed, [randomOpponent(lookup, 0, rng), randomOpponent(lookup, 2, rng)]),
      );
    }
  });
});
