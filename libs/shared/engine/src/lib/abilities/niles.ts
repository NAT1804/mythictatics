import type { Rank } from '@mythictatics/shared/contracts';
import type { AbilityDef, Fighter } from '../types';
import { lowest } from '../util';
import { ability, always, keywords, ofRealm, v } from './dsl';

const MUMMY = 'm01002';
const DARK_MEDJED = 'm01005';
const LIGHT_MEDJED = 'm01004';
const NILES_WARRIOR = 'm01001';

/** What each Sekhmet destroyed, to bring back on its Demise. */
const takenBySekhmet = new WeakMap<Fighter, { unitId: string; rank: Rank }[]>();

/** Niles: Demise, Reborn and summons — the realm that fights best while it is dying. */
export const NILES: readonly AbilityDef[] = [
  ability('m01001', {
    // Niles Warrior — Demise: Summon N Mummy.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
          b.summon(me.side, MUMMY, 0, { slot: me.slot, source: me });
        }
      },
    },
  }),
  keywords('m01004', 'taunt'),
  keywords('m01005', 'taunt'),
  ability('m01006', {
    // Babi — Reborn. Has +X Attack for each Babi died this game.
    innate: always('reborn'),
    hooks: {
      allyDied(b, me, dead) {
        if (dead.unitId !== me.unitId) return;
        b.trigger(me);
        b.buff(me, v(me.rank, [1, 2, 4]), 0);
      },
    },
  }),
  ability('m01007', {
    // Cat Archer — Ranged. Start of Battle: trigger the Demise of the ally in this column, N times.
    innate: always('ranged'),
    hooks: {
      startOfBattle(b, me) {
        const ally = b.column(me.side, me.slot % 3).find((fighter) => fighter !== me);
        if (!ally) return;
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) b.triggerDemise(ally);
      },
    },
  }),
  ability('m01008', {
    // Niles Cultist — After 3 allies are slain, your Niles have +X Attack.
    hooks: {
      allyDied(b, me) {
        const slain = (me.memory.get('slain') ?? 0) + 1;
        me.memory.set('slain', slain);
        if (slain % 3 !== 0) return;
        b.trigger(me);
        for (const ally of ofRealm(b.team(me), 'niles')) b.buff(ally, v(me.rank, [1, 2, 4]), 0);
      },
    },
  }),
  ability('m01009', {
    // Niles Commander — Whenever you summon an ally, give this +X/+X.
    hooks: {
      allySummoned(b, me, unit) {
        if (unit === me) return;
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        b.buff(me, gain, gain);
      },
    },
  }),
  keywords('m01010', 'lethal'),
  ability('m01012', {
    // Tawaret — Demise: Summon a Dark Medjed and a Light Medjed and give them +X/+X.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [0, 2, 4]);
        for (const unitId of [DARK_MEDJED, LIGHT_MEDJED]) {
          const summoned = b.summon(me.side, unitId, 0, { slot: me.slot, source: me });
          if (summoned) b.buff(summoned, gain, gain);
        }
      },
    },
  }),
  ability('m01014', {
    // Sepopard — Whenever you summon an ally in battle, give it +X/+X.
    hooks: {
      allySummoned(b, me, unit) {
        if (unit === me) return;
        b.trigger(me);
        const gain = v(me.rank, [4, 8, 16]);
        b.buff(unit, gain, gain);
      },
    },
  }),
  ability('m01016', {
    // Ammit — After a Niles ally is slain, gain +X/+X.
    hooks: {
      allyDied(b, me, dead) {
        if (dead.realm !== 'niles') return;
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        b.buff(me, gain, gain);
      },
    },
  }),
  ability('m01017', {
    // Griffin — Taunt. Reborn. After this is Reborn gain +X/+X.
    innate: always('taunt', 'reborn'),
    hooks: {
      reborn(b, me) {
        const gain = v(me.rank, [0, 2, 4]);
        if (!gain) return;
        b.trigger(me);
        b.buff(me, gain, gain);
      },
    },
  }),
  ability('m01018', {
    // Nefertem — Demise: Give N random different Niles allies Reborn.
    hooks: {
      demise(b, me) {
        const candidates = ofRealm(b.allies(me), 'niles').filter(
          (ally) => !ally.statuses.has('reborn'),
        );
        const chosen = b.rng.sample(candidates, v(me.rank, [1, 2, 3]));
        if (!chosen.length) return;
        b.trigger(me);
        for (const ally of chosen) b.grant(ally, 'reborn');
      },
    },
  }),
  ability('m01019', {
    // Sand Golem — Demise: Summon N Niles Warrior.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
          b.summon(me.side, NILES_WARRIOR, 0, { slot: me.slot, source: me });
        }
      },
    },
  }),
  ability('m01020', {
    // Sobek — Has +X/+X for every Niles ally summoned this game.
    hooks: {
      allySummoned(b, me, unit) {
        if (unit === me || unit.realm !== 'niles') return;
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        b.buff(me, gain, gain);
      },
    },
  }),
  ability('m01022', {
    // Anubis — After an ally is slain, give a different lowest Health ally Reborn (N per battle).
    hooks: {
      allyDied(b, me) {
        const ally = lowest(
          b.allies(me).filter((fighter) => !fighter.statuses.has('reborn')),
          (fighter) => fighter.health,
        );
        if (!ally || !b.uses(me, v(me.rank, [1, 2, 3]))) return;
        b.trigger(me);
        b.grant(ally, 'reborn');
      },
    },
  }),
  ability('m01023', {
    // Bastet — After you summon 3 allies in battle, Niles allies have +K/+K, K growing by X
    // after each trigger.
    hooks: {
      allySummoned(b, me, unit) {
        if (unit === me) return;
        const summoned = (me.memory.get('summoned') ?? 0) + 1;
        me.memory.set('summoned', summoned);
        if (summoned % 3 !== 0) return;
        const fired = me.memory.get('fired') ?? 0;
        me.memory.set('fired', fired + 1);
        const gain = 1 + fired * v(me.rank, [1, 2, 4]);
        b.trigger(me);
        for (const ally of ofRealm(b.team(me), 'niles')) b.buff(ally, gain, gain);
      },
    },
  }),
  ability('m01024', {
    // Sekhmet — After an ally is summoned in battle, destroy it (N per battle).
    // Demise: Summon their base copies.
    hooks: {
      allySummoned(b, me, unit) {
        if (unit === me || !b.uses(me, v(me.rank, [2, 4, 6]))) return;
        b.trigger(me);
        const taken = takenBySekhmet.get(me) ?? [];
        taken.push({ unitId: unit.unitId, rank: unit.rank });
        takenBySekhmet.set(me, taken);
        b.destroy(unit, me);
      },
      demise(b, me) {
        const taken = takenBySekhmet.get(me) ?? [];
        if (!taken.length) return;
        b.trigger(me);
        for (const { unitId, rank } of taken) {
          b.summon(me.side, unitId, rank, { slot: me.slot, source: me });
        }
      },
    },
  }),
  ability('m01025', {
    // Thoth — Reborn. Demise: Your Niles have +X Attack.
    innate: always('reborn'),
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (const ally of ofRealm(b.team(me), 'niles')) b.buff(ally, v(me.rank, [2, 4, 8]), 0);
      },
    },
  }),
  ability('m01026', {
    // Isis — After an ally is Reborn, give all allies +X/+X.
    hooks: {
      allyReborn(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [3, 6, 12]);
        for (const ally of b.team(me)) b.buff(ally, gain, gain);
      },
    },
  }),
  ability('m01027', {
    // Osiris — After a different ally is Reborn, give it this stats (double, triple).
    hooks: {
      allyReborn(b, me, copy) {
        if (copy === me) return;
        b.trigger(me);
        const times = v(me.rank, [1, 2, 3]);
        b.buff(copy, me.attack * times, me.health * times);
      },
    },
  }),
];
