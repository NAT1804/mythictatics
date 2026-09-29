import type { AbilityDef, Fighter, Patron, PatronDef } from '../types';
import { highest, other } from '../util';
import { ability, always } from './dsl';
import { xiaoTianquanDeploy } from './shenzhou';

const VALKYRIE = 'm03006';

/** The first Kami each Izanami saw fall, which is the one she brings back. */
const firstKamiSlain = new WeakMap<Patron, Fighter>();

/**
 * What a patron god does once it has descended onto a unit. The god's own body is added to the
 * unit's by the engine; these are the Descend lines that act in a battle. A god missing here
 * (Set, Nergal, Poseidon…) descends as a body alone — its Descend text is about the shop.
 */
export const DESCENDS: readonly AbilityDef[] = [
  ability('champ001', {
    // Horus — Start of Battle: Give the opposite enemy Taunt and attack it immediately.
    hooks: {
      startOfBattle(b, me) {
        const target = b.opposite(me);
        if (!target) return;
        b.trigger(me);
        b.grant(target, 'taunt');
        b.attackNow(me, target);
      },
    },
  }),
  ability('champ002', {
    // Ra — Whenever a Niles ally is summoned, Burn does 1 more damage and Burn(1) a random enemy.
    hooks: {
      allySummoned(b, me, unit) {
        if (unit === me || unit.realm !== 'niles') return;
        b.trigger(me);
        b.addBurnBonus(me.side, 1);
        const target = b.rng.pick(b.foes(me));
        if (target) b.burn(target, 1, me.side);
      },
    },
  }),
  ability('champ004', {
    // Anu — Start of Battle: Gain the stats of your highest stats unit.
    hooks: {
      startOfBattle(b, me) {
        const best = highest(b.allies(me), (ally) => ally.attack + ally.health);
        if (!best) return;
        b.trigger(me);
        b.buff(me, best.attack, best.health);
      },
    },
  }),
  ability('champ005', {
    // Enlil — Attack: Deal damage equal to this Attack to the target.
    hooks: {
      beforeAttack(b, me, target) {
        b.trigger(me);
        b.damage(me, target, me.attack);
      },
    },
  }),
  ability('champ008', {
    // Tiamat — Demise: Summon 3 random Babylon units from Tier 4 or lower, +3/+3 for each
    // Babylon ally (the Babylon allies it fought beside stand in for "deployed this game").
    hooks: {
      startOfBattle(b, me) {
        me.memory.set('babylon', b.team(me).filter((ally) => ally.realm === 'babylon').length);
      },
      demise(b, me) {
        const pool = b.cards.units.filter((unit) => unit.realm === 'babylon' && unit.tier <= 4);
        b.trigger(me);
        const gain = 3 * (me.memory.get('babylon') ?? 0);
        for (let i = 0; i < 3; i++) {
          const unit = b.rng.pick(pool);
          if (!unit) return;
          const summoned = b.summon(me.side, unit.id, 0, { slot: me.slot, source: me });
          if (summoned) b.buff(summoned, gain, gain);
        }
      },
    },
  }),
  ability('champ009', {
    // Ishtar — Safeguard.
    innate: always('safeguard'),
  }),
  ability('champ010', {
    // Hades — Conceal. Has the Attack of every ally slain this battle.
    innate: always('conceal'),
    hooks: {
      allyDied(b, me, dead) {
        b.trigger(me);
        b.buff(me, dead.attack, 0);
      },
    },
  }),
  ability('champ011', {
    // Zeus — Attack: Cast The Lightning Bolt (1 damage plus Zeus's Attack, to the highest
    // Health enemy).
    hooks: {
      beforeAttack(b, me) {
        const target = highest(b.foes(me), (foe) => foe.health);
        if (!target) return;
        b.trigger(me);
        b.damage(me, target, 1 + me.attack);
      },
    },
  }),
  ability('champ013', {
    // Hel — After an ally is slain in battle, give its stats to another ally (3 per battle).
    hooks: {
      allyDied(b, me, dead) {
        const ally = b.rng.pick(b.team(me));
        if (!ally || !b.uses(me, 3)) return;
        b.trigger(me);
        b.buff(ally, dead.attack, dead.base.health);
      },
    },
  }),
  ability('champ015', {
    // Odin — When you have space, summon a Valkyrie and give it this Attack (3 per battle).
    hooks: {
      allyDied(b, me) {
        if (!b.uses(me, 3)) return;
        b.trigger(me);
        const valkyrie = b.summon(me.side, VALKYRIE, 0, { slot: me.slot, source: me });
        if (valkyrie) b.buff(valkyrie, me.attack, 0);
      },
    },
  }),
  ability('champ016', {
    // Erlang Shen — Attack: Trigger Xiao Tianquan's Deploy.
    hooks: {
      beforeAttack(b, me) {
        b.trigger(me);
        xiaoTianquanDeploy(b, me, 0);
      },
    },
  }),
  ability('champ019', {
    // Izanami — Demise: Deal 1 damage to a random enemy in this column, once for each Kami ally
    // slain this battle.
    hooks: {
      demise(b, me) {
        const times = b.count(me.side, 'slain:kami', 0);
        if (!times) return;
        b.trigger(me);
        for (let i = 0; i < times; i++) {
          const target = b.rng.pick(b.column(other(me.side), me.slot % 3));
          if (target) b.damage(me, target, 1);
        }
      },
    },
  }),
  ability('champ021', {
    // Amaterasu — Attack: Deal damage equal to this Attack to all enemies with Burn.
    hooks: {
      beforeAttack(b, me) {
        const burning = b.foes(me).filter((foe) => foe.burn > 0);
        if (!burning.length) return;
        b.trigger(me);
        for (const foe of burning) b.damage(me, foe, me.attack);
      },
    },
  }),
];

/**
 * Patron Powers that act in a battle, whether or not the god descended. The rest are bought or
 * used in the shop — Horus's Conjure, Anu's Ascend — and so do nothing here.
 */
export const POWERS: readonly PatronDef[] = [
  {
    // Ra — Blessing of the Sun: After you summon a unit in battle, give it +1/+1 and Taunt.
    id: 'champ002',
    hooks: {
      allySummoned(b, patron, unit) {
        b.trigger(patron);
        b.buff(unit, 1, 1);
        b.grant(unit, 'taunt');
      },
    },
  },
  {
    // Hades — God of the Dead: After an ally is slain, give its Attack to another random ally
    // (once per battle).
    id: 'champ010',
    hooks: {
      allyDied(b, patron, dead) {
        const ally = b.rng.pick(b.living(patron.side));
        if (!ally || !b.uses(patron, 1)) return;
        b.trigger(patron);
        b.buff(ally, dead.attack, 0);
      },
    },
  },
  {
    // Zeus — The Lightning Bolt: Start of Battle: Deal 1 damage to the highest Health enemy.
    // A descended Zeus adds his Attack to it.
    id: 'champ011',
    hooks: {
      startOfBattle(b, patron) {
        const target = highest(b.foes(patron.side), (foe) => foe.health);
        if (!target) return;
        const zeus = b.living(patron.side).find((ally) => ally.godId === patron.god.id);
        b.trigger(patron);
        b.damage(zeus ?? null, target, 1 + (zeus?.attack ?? 0));
      },
    },
  },
  {
    // Izanami — Vengeful Spirits: After 3 Kami allies are slain, summon the first Kami ally
    // slain this battle.
    id: 'champ019',
    hooks: {
      allyDied(b, patron, dead) {
        if (dead.realm !== 'kami') return;
        const first = firstKamiSlain.get(patron) ?? dead;
        firstKamiSlain.set(patron, first);
        if (b.count(patron.side, 'slain:kami', 0) < 3 || !b.uses(patron, 1)) return;
        b.trigger(patron);
        b.summon(patron.side, first.unitId, first.rank, { slot: dead.slot });
      },
    },
  },
  {
    // Amaterasu — Sunforged: When an ally attacks, it also Burns(1) a random enemy adjacent to
    // its target (once per battle).
    id: 'champ021',
    hooks: {
      allyAttacks(b, patron, _attacker, target) {
        const victim = b.rng.pick(b.adjacent(target));
        if (!victim || !b.uses(patron, 1)) return;
        b.trigger(patron);
        b.burn(victim, 1, patron.side);
      },
    },
  },
];
