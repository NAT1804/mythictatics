import { BOARD_COLUMNS } from '@mythictatics/shared/contracts';
import { columnOf } from '@mythictatics/shared/domain';
import type { Battle } from '../battle';
import type { AbilityDef, Fighter } from '../types';
import { ability, always, byRank, ofRealm, slay, v } from './dsl';

/**
 * The enemies in the target's column; with `spread` 1 also one column beside it (the right one,
 * or the left at the board's edge); with 2, both columns beside it.
 */
function columnsAround(b: Battle, target: Fighter, spread: 0 | 1 | 2): Fighter[] {
  const centre = columnOf(target.slot);
  const right = centre + 1 < BOARD_COLUMNS ? centre + 1 : centre - 1;
  const columns = [[centre], [centre, right], [centre - 1, centre, centre + 1]][spread];
  return columns
    .filter((column) => column >= 0 && column < BOARD_COLUMNS)
    .flatMap((column) => b.column(target.side, column));
}

/** Chimera's "Attack and Counter" text, which aims at whoever it is fighting. */
function chimera(b: Battle, me: Fighter, target: Fighter): void {
  b.trigger(me);
  const turns = v(me.rank, [3, 6, 9]);
  for (const enemy of columnsAround(b, target, me.rank)) b.burn(enemy, turns, me.side);
}

function hydra(b: Battle, me: Fighter, target: Fighter): void {
  b.trigger(me);
  const turns = v(me.rank, [3, 6, 9]);
  for (const enemy of [target, ...b.nextTo(target)]) b.burn(enemy, turns, me.side);
}

/** Olympus: Safeguard and Burn — the realm that answers a broken shield with an attack. */
export const OLYMPUS: readonly AbilityDef[] = [
  ability('m02001', {
    // Everspring — Deploy and Start of Battle: Give all other Olympus allies +X/+X.
    hooks: {
      startOfBattle(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        for (const ally of ofRealm(b.allies(me), 'olympus')) b.buff(ally, gain, gain);
      },
    },
  }),
  ability('m02002', {
    // Orthros — Taunt. Safeguard. After this loses Safeguard, gain +X/+X.
    innate: always('taunt', 'safeguard'),
    hooks: {
      lostSafeguard(b, me) {
        const gain = v(me.rank, [0, 2, 4]);
        if (!gain) return;
        b.trigger(me);
        b.buff(me, gain, gain);
      },
    },
  }),
  ability('m02003', {
    // Aetos — Whenever an Olympus ally attacks, give it +X/+Y.
    hooks: {
      allyAttacks(b, me, attacker) {
        if (attacker.realm !== 'olympus') return;
        b.trigger(me);
        b.buff(attacker, v(me.rank, [2, 4, 8]), v(me.rank, [1, 2, 4]));
      },
    },
  }),
  ability('m02004', {
    // Medea, the Priestess — Start of Battle: Give Olympus allies +X Attack.
    hooks: {
      startOfBattle(b, me) {
        b.trigger(me);
        for (const ally of ofRealm(b.team(me), 'olympus')) b.buff(ally, v(me.rank, [4, 8, 16]), 0);
      },
    },
  }),
  ability('m02009', {
    // Crinbrog — After an ally loses Safeguard, give it Safeguard and +X Attack (1 per battle).
    hooks: {
      allyLostSafeguard(b, me, ally) {
        if (!b.stands(ally) || !b.uses(me, 1)) return;
        b.trigger(me);
        b.buff(ally, v(me.rank, [4, 8, 16]), 0);
        b.grant(ally, 'safeguard');
      },
    },
  }),
  ability('m02010', {
    // Grafigi — Deploy: Your Burn deals X extra damage this game. Deploying happens before the
    // battle, so the bonus is simply in force from its start.
    hooks: {
      startOfBattle(b, me) {
        b.trigger(me);
        b.addBurnBonus(me.side, v(me.rank, [2, 4, 8]));
      },
    },
  }),
  ability('m02012', {
    // Chimera — Attack and Counter: Burn(X) all enemies on the target's column (and more columns).
    hooks: {
      beforeAttack: chimera,
      beforeCounter: chimera,
    },
  }),
  ability('m02013', {
    // Minotaur — Start of Battle: Give N random Olympus allies +X/+X and Safeguard.
    hooks: {
      startOfBattle(b, me) {
        const chosen = b.rng.sample(ofRealm(b.allies(me), 'olympus'), v(me.rank, [1, 2, 2]));
        if (!chosen.length) return;
        b.trigger(me);
        const gain = v(me.rank, [5, 5, 10]);
        for (const ally of chosen) {
          b.buff(ally, gain, gain);
          b.grant(ally, 'safeguard');
        }
      },
    },
  }),
  ability('m02015', {
    // Medusa — Attack: Set the target's stats to 1/1 (N per battle).
    hooks: {
      beforeAttack(b, me, target) {
        if (!b.uses(me, v(me.rank, [1, 2, 4]))) return;
        b.trigger(me);
        b.setStats(target, 1, 1);
      },
    },
  }),
  ability('m02016', {
    // Hydra — Attack and Counter: Burn(X) the target and all enemies next to it.
    hooks: {
      beforeAttack: hydra,
      beforeCounter: hydra,
    },
  }),
  ability('m02017', {
    // Typhon — Attack: Burn(X) the target and adjacent enemies; at Rank 3, every enemy.
    hooks: {
      beforeAttack(b, me, target) {
        b.trigger(me);
        const victims = me.rank === 2 ? b.foes(me) : [target, ...b.adjacent(target)];
        for (const enemy of victims) b.burn(enemy, v(me.rank, [6, 12, 12]), me.side);
      },
    },
  }),
  ability('m02018', {
    // Artemis — Ranged. Attacks the lowest Health enemy.
    // Slay(1): Give N other Olympus allies Safeguard.
    innate: always('ranged'),
    targeting: 'lowest-health',
    hooks: {
      slay: slay(1, (b, me) => {
        const chosen = b.rng.sample(
          ofRealm(b.allies(me), 'olympus').filter((ally) => !ally.statuses.has('safeguard')),
          v(me.rank, [1, 2, 4]),
        );
        for (const ally of chosen) b.grant(ally, 'safeguard');
      }),
    },
  }),
  ability('m02019', {
    // Ares — Attack: Give N other random allies this Attack (doubled at Rank 2) and Safeguard.
    hooks: {
      beforeAttack(b, me) {
        const chosen = b.rng.sample(b.allies(me), v(me.rank, [1, 1, 2]));
        if (!chosen.length) return;
        b.trigger(me);
        const gain = me.attack * v(me.rank, [1, 2, 1]);
        for (const ally of chosen) {
          b.buff(ally, gain, 0);
          b.grant(ally, 'safeguard');
        }
      },
    },
  }),
  ability('m02020', {
    // Aether & Hemera — When the ally in front of this is attacked, give it +X Health and
    // Safeguard (N per battle).
    hooks: {
      allyAttacked(b, me, ally) {
        if (b.inFront(me) !== ally || !b.uses(me, v(me.rank, [1, 2, 3]))) return;
        b.trigger(me);
        b.buff(ally, 0, v(me.rank, [4, 8, 16]));
        b.grant(ally, 'safeguard');
      },
    },
  }),
  ability('m02021', {
    // Prometheus — Reborn. Demise: Your Burn deals X extra damage this game.
    innate: always('reborn'),
    hooks: {
      demise(b, me) {
        b.trigger(me);
        b.addBurnBonus(me.side, v(me.rank, [1, 2, 4]));
      },
    },
  }),
  ability('m02022', {
    // Apollo — Ranged. When an ally gains Safeguard, attack immediately and Burn(6) the target
    // (N per battle).
    innate: always('ranged'),
    hooks: {
      allyGainedSafeguard(b, me) {
        if (!b.stands(me) || !b.uses(me, v(me.rank, [1, 3, 999]))) return;
        b.trigger(me);
        me.memory.set('burning', 1);
        b.attackNow(me);
        me.memory.set('burning', 0);
      },
      beforeAttack(b, me, target) {
        if (me.memory.get('burning') === 1) b.burn(target, 6, me.side);
      },
    },
  }),
  ability('m02023', {
    // Athena — After an ally gains Safeguard, give all allies +X/+X and make that ally attack
    // immediately (N per battle).
    hooks: {
      allyGainedSafeguard(b, me, ally) {
        if (!b.uses(me, v(me.rank, [2, 3, 99]))) return;
        b.trigger(me);
        const gain = v(me.rank, [2, 4, 8]);
        for (const friend of b.team(me)) b.buff(friend, gain, gain);
        b.attackNow(ally);
      },
    },
  }),
  ability('m02024', {
    // Hercules — keeps what it gains in battle, which only matters between battles. Rank 3 is
    // born with Safeguard.
    innate: byRank([[], [], ['safeguard']]),
  }),
];
