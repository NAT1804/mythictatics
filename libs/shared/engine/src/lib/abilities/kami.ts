import type { AbilityDef } from '../types';
import { highest, other } from '../util';
import { ability, alternate, always, ofRealm, slay, v } from './dsl';

/** Kami: Conceal, and a side that feeds on its own hits. */
export const KAMI: readonly AbilityDef[] = [
  ability('m06001', {
    // Chochin-obake — Conceal. After this loses Conceal, gain +X Attack.
    innate: always('conceal'),
    hooks: {
      lostConceal(b, me) {
        b.trigger(me);
        b.buff(me, v(me.rank, [1, 2, 4]), 0);
      },
    },
  }),
  ability('m06002', {
    // Kara-kasa Obake — Attack: Deal X damage to the target.
    hooks: {
      beforeAttack(b, me, target) {
        b.trigger(me);
        b.damage(me, target, v(me.rank, [2, 4, 8]));
      },
    },
  }),
  ability('m06003', {
    // Namahage — After a Kami ally deals damage, give other Kami allies +X Attack.
    hooks: {
      allyDealtDamage(b, me, dealer) {
        if (dealer.realm !== 'kami') return;
        b.trigger(me);
        for (const ally of ofRealm(b.allies(me), 'kami')) b.buff(ally, v(me.rank, [1, 2, 4]), 0);
      },
    },
  }),
  ability('m06004', {
    // Nurikabe — Cannot Attack. Whenever this is attacked, give another random ally +X Attack
    // and Conceal it.
    innate: always('cannot_attack'),
    hooks: {
      attacked(b, me) {
        const ally = b.rng.pick(b.allies(me));
        if (!ally) return;
        b.trigger(me);
        b.buff(ally, v(me.rank, [1, 2, 3]), 0);
        b.grant(ally, 'conceal');
      },
    },
  }),
  ability('m06005', {
    // Wanyudo — Demise: Deal X damage and Burn(Y) all enemies on this column (twice at Rank 3).
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 1, 2]); i++) {
          for (const foe of b.column(other(me.side), me.slot % 3)) {
            b.damage(me, foe, v(me.rank, [1, 2, 2]));
            b.burn(foe, v(me.rank, [4, 8, 8]), me.side);
          }
        }
      },
    },
  }),
  ability('m06006', {
    // Tanuki — Safeguard. Whenever another Kami ally attacks, give Conceal allies +X/+Y.
    innate: always('safeguard'),
    hooks: {
      allyAttacks(b, me, attacker) {
        if (attacker === me || attacker.realm !== 'kami') return;
        const hidden = b.team(me).filter((ally) => ally.statuses.has('conceal'));
        if (!hidden.length) return;
        b.trigger(me);
        for (const ally of hidden) b.buff(ally, v(me.rank, [2, 4, 8]), v(me.rank, [1, 2, 4]));
      },
    },
  }),
  ability('m06007', {
    // Hitosume Kozo — Demise: Conceal all Kami allies and give them +X Attack.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (const ally of ofRealm(b.allies(me), 'kami')) {
          b.grant(ally, 'conceal');
          b.buff(ally, v(me.rank, [1, 2, 4]), 0);
        }
      },
    },
  }),
  ability('m06008', {
    // Tesso — Demise: Deal X damage to the highest Health enemy, N times.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 4]); i++) {
          const target = highest(b.foes(me), (foe) => foe.health);
          if (target) b.damage(me, target, v(me.rank, [4, 8, 16]));
        }
      },
    },
  }),
  ability('m06009', {
    // Yuki Onna — Taunt. Whenever this is attacked, deal 4 damage N times to the attacker and
    // Conceal this.
    innate: always('taunt'),
    hooks: {
      attacked(b, me, attacker) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) b.damage(me, attacker, 4);
        b.grant(me, 'conceal');
      },
    },
  }),
  ability('m06012', {
    // Futakuchi Onna — Attack: If this is Concealed, deal damage equal to this Attack to an
    // enemy next to the target (all next to it; all adjacent to it).
    hooks: {
      beforeAttack(b, me, target) {
        if (!me.statuses.has('conceal')) return;
        const around = me.rank === 2 ? b.adjacent(target) : b.nextTo(target);
        const struck = me.rank === 0 ? b.rng.sample(around, 1) : around;
        if (!struck.length) return;
        b.trigger(me);
        for (const foe of struck) b.damage(me, foe, me.attack);
      },
    },
  }),
  ability('m06013', {
    // Hanadaka Tengu — Conceal. Whenever an ally attacks, give another random ally +X/+X and
    // Conceal it.
    innate: always('conceal'),
    hooks: {
      allyAttacks(b, me, attacker) {
        const ally = b.rng.pick(b.allies(me).filter((fighter) => fighter !== attacker));
        if (!ally) return;
        b.trigger(me);
        const gain = v(me.rank, [2, 4, 8]);
        b.buff(ally, gain, gain);
        b.grant(ally, 'conceal');
      },
    },
  }),
  ability('m06014', {
    // Karasu Tengu — Whenever a Kami ally attacks, deal X damage to the highest Health enemy,
    // N times.
    hooks: {
      allyAttacks(b, me, attacker) {
        if (attacker.realm !== 'kami') return;
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
          const target = highest(b.foes(me), (foe) => foe.health);
          if (target) b.damage(me, target, v(me.rank, [2, 2, 4]));
        }
      },
    },
  }),
  ability('m06015', {
    // Nekomata — Start of Battle: Deal X damage to the opposite enemy, then give it Taunt and
    // Vulnerable.
    hooks: {
      startOfBattle(b, me) {
        const target = b.opposite(me);
        if (!target) return;
        b.trigger(me);
        b.damage(me, target, v(me.rank, [4, 8, 16]));
        b.grant(target, 'taunt');
        b.grant(target, 'vulnerable');
      },
    },
  }),
  ability('m06016', {
    // Umibozu — Conceal. Slay(1): Gain +X/+X and Conceal itself.
    innate: always('conceal'),
    hooks: {
      slay: slay(1, (b, me) => {
        const gain = v(me.rank, [2, 4, 8]);
        b.buff(me, gain, gain);
        b.grant(me, 'conceal');
      }),
    },
  }),
  ability('m06017', {
    // Odokuro — After a Kami ally deals damage, gain +X/+Y.
    hooks: {
      allyDealtDamage(b, me, dealer) {
        if (dealer.realm !== 'kami') return;
        b.trigger(me);
        b.buff(me, v(me.rank, [2, 4, 8]), v(me.rank, [1, 2, 4]));
      },
    },
  }),
  ability('m06018', {
    // Sarutahiko — Conceal. Whenever an ally attacks, give all allies +X Attack; Concealed
    // allies gain +2X/+2X instead.
    innate: always('conceal'),
    hooks: {
      allyAttacks(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        for (const ally of b.team(me)) {
          if (ally.statuses.has('conceal')) b.buff(ally, gain * 2, gain * 2);
          else b.buff(ally, gain, 0);
        }
      },
    },
  }),
  ability('m06019', {
    // Raijin — Cannot Attack. When a Kami ally attacks, deal damage equal to this Attack to the
    // target (N per battle).
    innate: always('cannot_attack'),
    hooks: {
      allyAttacks(b, me, attacker, target) {
        if (attacker.realm !== 'kami' || !b.uses(me, v(me.rank, [2, 4, Infinity]))) return;
        b.trigger(me);
        b.damage(me, target, me.attack);
      },
    },
  }),
  ability('m06020', {
    // Fujin — Start of Battle: Give Kami allies next to this (adjacent; all) +5/+5 and Double
    // Strike.
    hooks: {
      startOfBattle(b, me) {
        const reach = me.rank === 0 ? b.nextTo(me) : me.rank === 1 ? b.adjacent(me) : b.allies(me);
        const chosen = ofRealm(reach, 'kami');
        if (!chosen.length) return;
        b.trigger(me);
        for (const ally of chosen) {
          b.buff(ally, 5, 5);
          b.grant(ally, 'double_strike');
        }
      },
    },
  }),
  ability('m06021', {
    // Ame no Uzume — Conceal. Whenever an ally loses Conceal, give all other allies +X/+Y.
    innate: always('conceal'),
    hooks: {
      allyLostConceal(b, me) {
        b.trigger(me);
        for (const friend of b.allies(me))
          b.buff(friend, v(me.rank, [2, 4, 8]), v(me.rank, [1, 2, 4]));
      },
    },
  }),
  ability('m06022', {
    // Hachiman — Attack: Deal X damage to the target, once more for every time another ally
    // has attacked.
    hooks: {
      allyAttacks(_b, me, attacker) {
        if (attacker !== me) me.memory.set('reps', (me.memory.get('reps') ?? 0) + 1);
      },
      beforeAttack(b, me, target) {
        b.trigger(me);
        const reps = 1 + (me.memory.get('reps') ?? 0);
        for (let i = 0; i < reps && b.stands(target); i++)
          b.damage(me, target, v(me.rank, [8, 16, 32]));
      },
    },
  }),
  ability('m06023', {
    // Ryujin — Whenever a Kami ally deals damage, give all allies +X Attack (switching between
    // Attack and Health each trigger).
    hooks: {
      allyDealtDamage(b, me, dealer) {
        if (dealer.realm !== 'kami') return;
        b.trigger(me);
        const gain = v(me.rank, [2, 4, 8]);
        const attack = alternate(me) === 0;
        for (const ally of b.team(me)) b.buff(ally, attack ? gain : 0, attack ? 0 : gain);
      },
    },
  }),
  ability('m06024', {
    // Susanoo — Lethal. Slay(1): Give N random Kami allies Lethal.
    innate: always('lethal'),
    hooks: {
      slay: slay(1, (b, me) => {
        const candidates = ofRealm(b.allies(me), 'kami').filter(
          (ally) => !ally.statuses.has('lethal'),
        );
        for (const ally of b.rng.sample(candidates, v(me.rank, [1, 2, 3]))) b.grant(ally, 'lethal');
      }),
    },
  }),
];
