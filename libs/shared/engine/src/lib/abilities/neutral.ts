import type { AbilityDef } from '../types';
import { ability, always, keywords, v } from './dsl';

const REMOVED_BY_FLAYER = [
  ['taunt', 'reborn', 'lethal'],
  ['taunt', 'reborn', 'lethal', 'safeguard'],
  ['taunt', 'reborn', 'lethal', 'safeguard', 'cleave', 'pierce'],
] as const;

/** Neutral: every draft has it, so these are the cards any board can meet. */
export const NEUTRAL: readonly AbilityDef[] = [
  keywords('m10001', 'taunt', 'cannot_attack'),
  keywords('m10003', 'taunt', 'cannot_attack'),
  ability('m10009', {
    // Mortissa — Aura: Ally Demise effects trigger N extra times.
    demiseEchoes: (rank) => v(rank, [1, 2, 3]),
  }),
  ability('m10012', {
    // Huitz — Demise: Give another ally +X Health and Safeguard.
    hooks: {
      demise(b, me) {
        const ally = b.rng.pick(b.allies(me));
        if (!ally) return;
        b.trigger(me);
        b.buff(ally, 0, v(me.rank, [2, 4, 8]));
        b.grant(ally, 'safeguard');
      },
    },
  }),
  ability('m10014', {
    // Infesta — Demise: Destroy the enemy that slew this (and deal 20 damage to N random enemies).
    hooks: {
      demise(b, me, killer) {
        b.trigger(me);
        if (killer && killer.side !== me.side) b.destroy(killer, me);
        const others = b.foes(me).filter((foe) => foe !== killer);
        for (const foe of b.rng.sample(others, v(me.rank, [0, 1, 2]))) b.damage(me, foe, 20);
      },
    },
  }),
  ability('m10016', {
    // Tribal Protector — Taunt. Whenever this is attacked, give a unit from each Realm +X/+X.
    innate: always('taunt'),
    hooks: {
      attacked(b, me) {
        const byRealm = new Map<string, (typeof me)[]>();
        for (const ally of b.team(me))
          byRealm.set(ally.realm, [...(byRealm.get(ally.realm) ?? []), ally]);
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        for (const group of byRealm.values()) {
          const chosen = b.rng.pick(group);
          if (chosen) b.buff(chosen, gain, gain);
        }
      },
    },
  }),
  ability('m10023', {
    // Tribal Flayer — Double Strike. Attack: Remove Taunt, Reborn and Lethal (and more, by Rank)
    // from the target.
    innate: always('double_strike'),
    hooks: {
      beforeAttack(b, me, target) {
        b.trigger(me);
        for (const status of REMOVED_BY_FLAYER[me.rank]) b.strip(target, status);
      },
    },
  }),
];
