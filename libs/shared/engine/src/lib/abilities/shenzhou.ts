import type { Rank } from '@mythictatics/shared/contracts';
import type { Battle } from '../battle';
import type { AbilityDef, Fighter } from '../types';
import { ability, always, ofRealm, v } from './dsl';

/**
 * Xiao Tianquan's Deploy: a random Medicine up to Tier 4 on every other ally, N times. Erlang
 * Shen's Descend fires it on every attack, which is the one way it reaches a battle.
 */
export function xiaoTianquanDeploy(b: Battle, me: Fighter, rank: Rank): void {
  for (let i = 0; i < v(rank, [1, 2, 4]); i++) {
    for (const ally of b.allies(me)) b.castMedicine(ally, b.medicineTier(4));
  }
}

/** Xiao Longnu's "Attack and Counter" text. */
function xiaoLongnu(b: Battle, me: Fighter, target: Fighter): void {
  if (!me.medicine || !b.uses(me, v(me.rank, [2, 4, 99]))) return;
  b.trigger(me);
  b.damage(me, target, v(me.rank, [2, 4, 8]) * me.medicine);
}

/**
 * Shenzhou: Celestial Medicine. Almost all of it is brewed in the shop (Alchemy), so in a battle
 * the realm is the few cards that cast Medicine mid-fight and the ones that react to receiving it
 * — see `Battle.castMedicine` for what a Medicine is worth here.
 */
export const SHENZHOU: readonly AbilityDef[] = [
  ability('m04005', {
    // Small Monkey — Whenever this receives Celestial Medicine, gain +X/+X. (Its transformation
    // after 20 Medicines is a shop-long count, out of reach of one battle.)
    hooks: {
      medicine(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        b.buff(me, gain, gain);
      },
    },
  }),
  ability('m04007', {
    // Pipa Jing — Taunt. (The Medicine it gets when hit goes to the hand.)
    innate: always('taunt'),
  }),
  ability('m04009', {
    // Nian — Deploy and Demise: Cast a random Tier 2 Medicine on adjacent allies, N times.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
          for (const ally of b.adjacent(me)) b.castMedicine(ally, 2);
        }
      },
    },
  }),
  ability('m04012', {
    // Lei Zhenzi — Whenever this receives a Medicine, deal damage equal to the Medicine it has
    // received to a random enemy (N per battle).
    hooks: {
      medicine(b, me) {
        const target = b.rng.pick(b.foes(me));
        if (!target || !b.uses(me, v(me.rank, [6, 12, 99]))) return;
        b.trigger(me);
        b.damage(me, target, me.medicine);
      },
    },
  }),
  ability('m04014', {
    // Shiji Niangniang — Whenever an ally attacks, cast a random Medicine on the allies on this
    // row, N times.
    hooks: {
      allyAttacks(b, me) {
        b.trigger(me);
        const row = me.slot < 3;
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
          for (const ally of b.team(me)) {
            if (ally.slot < 3 === row) b.castMedicine(ally, b.medicineTier(3));
          }
        }
      },
    },
  }),
  ability('m04015', {
    // Longji Princess — Whenever this receives a Medicine, cast it on N other Shenzhou allies.
    // A Medicine it passed on is not passed on again, or two Princesses would trade one forever.
    hooks: {
      medicine(b, me, tier, echo) {
        if (echo) return;
        const chosen = b.rng.sample(ofRealm(b.allies(me), 'shenzhou'), v(me.rank, [1, 2, 3]));
        if (!chosen.length) return;
        b.trigger(me);
        for (const ally of chosen) b.castMedicine(ally, tier, true);
      },
    },
  }),
  ability('m04020', {
    // Xu Daji — Demise: Cast a random Medicine on each Shenzhou ally, N times.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 4]); i++) {
          for (const ally of ofRealm(b.team(me), 'shenzhou'))
            b.castMedicine(ally, b.medicineTier(3));
        }
      },
    },
  }),
  ability('m04021', {
    // Xiao Longnu — Attack and Counter: Deal X damage for each Medicine this received to the
    // target (N per battle).
    hooks: {
      beforeAttack: xiaoLongnu,
      beforeCounter: xiaoLongnu,
    },
  }),
];
