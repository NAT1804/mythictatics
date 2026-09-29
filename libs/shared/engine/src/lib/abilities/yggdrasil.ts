import type { Battle } from '../battle';
import type { AbilityDef, Fighter } from '../types';
import { other } from '../util';
import { ability, alternate, always, ofRealm, sameCard, slay, slays, v } from './dsl';

const SHEEP = 'm10003';
const DRAUGR = 'm03009';

/** What Draugr hands out: "Demise: Summon a Draugr", as an ability of its own. */
const DRAUGR_GIFT: AbilityDef = ability(`${DRAUGR}:gift`, {
  hooks: {
    demise(b, me) {
      b.trigger(me);
      b.summon(me.side, DRAUGR, 0, { slot: me.slot, source: me });
    },
  },
});

/** Yggdrasil: units that get stronger for being hit, and Slay chains. */
export const YGGDRASIL: readonly AbilityDef[] = [
  ability('m03001', {
    // Viking Warrior — Slay(1): Gain +X Attack.
    hooks: { slay: slay(1, (b, me) => b.buff(me, v(me.rank, [1, 2, 4]), 0)) },
  }),
  ability('m03002', {
    // Light Elf — Cannot Attack. When an ally attacks, give it +X Health (N per battle).
    innate: always('cannot_attack'),
    hooks: {
      allyAttacks(b, me, attacker) {
        if (!b.uses(me, v(me.rank, [2, 4, 4]))) return;
        b.trigger(me);
        b.buff(attacker, 0, v(me.rank, [4, 8, 16]));
      },
    },
  }),
  ability('m03003', {
    // Berserker — Slay(1): Gain +X/+X. Slay(2): Multiply this Attack and attack immediately.
    hooks: {
      slay: slays(
        slay(1, (b, me) => {
          const gain = v(me.rank, [3, 6, 9]);
          b.buff(me, gain, gain);
        }),
        slay(2, (b, me) => {
          b.buff(me, me.attack * (v(me.rank, [2, 3, 4]) - 1), 0);
          b.attackNow(me);
        }),
      ),
    },
  }),
  ability('m03004', {
    // Yule Lad — Demise: Summon N Sheep on the enemy field. They Cannot Attack.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
          b.summon(other(me.side), SHEEP, 0, { slot: me.slot, source: me });
        }
      },
    },
  }),
  ability('m03005', {
    // Kelpie — Demise: Make the enemies in this column (and one beside it; at Rank 3, all
    // enemies) Vulnerable.
    hooks: {
      demise(b, me) {
        b.trigger(me);
        const column = me.slot % 3;
        const beside = column === 2 ? 1 : column + 1;
        const columns = [[column], [column, beside], [0, 1, 2]][me.rank];
        for (const col of columns) {
          for (const foe of b.column(other(me.side), col)) b.grant(foe, 'vulnerable');
        }
      },
    },
  }),
  ability('m03006', {
    // Valkyrie — Slay(1): Valkyries everywhere have +X/+Y.
    hooks: {
      slay: slay(1, (b, me) => {
        for (const valkyrie of sameCard(b.team(me), me.unitId)) {
          b.buff(valkyrie, v(me.rank, [2, 4, 8]), v(me.rank, [1, 2, 4]));
        }
      }),
    },
  }),
  ability('m03007', {
    // Healer Huldra — When an ally takes damage, give it +X Health (3 per battle).
    hooks: {
      allyDamaged(b, me, ally) {
        if (!b.stands(ally) || !b.uses(me, 3)) return;
        b.trigger(me);
        b.buff(ally, 0, v(me.rank, [1, 2, 4]));
      },
    },
  }),
  ability('m03008', {
    // Dark Elf — Cannot Attack. Whenever a same-column ally attacks, deal 1 damage to it and
    // give it +X Attack.
    innate: always('cannot_attack'),
    hooks: {
      allyAttacks(b, me, attacker) {
        if (attacker === me || attacker.slot % 3 !== me.slot % 3) return;
        b.trigger(me);
        b.damage(me, attacker, 1);
        b.buff(attacker, v(me.rank, [4, 8, 16]), 0);
      },
    },
  }),
  ability(DRAUGR, {
    // Draugr — Taunt. Demise: Give N different Yggdrasil allies "Demise: Summon a Draugr"
    // (except Draugr).
    innate: always('taunt'),
    hooks: {
      demise(b, me) {
        const candidates = ofRealm(b.allies(me), 'yggdrasil').filter(
          (ally) => ally.unitId !== DRAUGR && !ally.abilities.includes(DRAUGR_GIFT),
        );
        const chosen = b.rng.sample(candidates, v(me.rank, [1, 2, 3]));
        if (!chosen.length) return;
        b.trigger(me);
        for (const ally of chosen) ally.abilities.push(DRAUGR_GIFT);
      },
    },
  }),
  ability('m03010', {
    // Tree Jotunn — Whenever another Yggdrasil ally takes damage, this gains +X/+X.
    hooks: {
      allyDamaged(b, me, ally) {
        if (ally === me || ally.realm !== 'yggdrasil') return;
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        b.buff(me, gain, gain);
      },
    },
  }),
  ability('m03011', {
    // Ice Jotunn — Taunt. Whenever this takes damage, deal 1 damage to adjacent allies
    // (twice at Rank 3) (N per battle).
    innate: always('taunt'),
    hooks: {
      damaged(b, me) {
        if (!b.uses(me, v(me.rank, [2, 4, 4]))) return;
        b.trigger(me);
        for (let i = 0; i < v(me.rank, [1, 1, 2]); i++) {
          for (const ally of b.adjacent(me)) b.damage(me, ally, 1);
        }
      },
    },
  }),
  ability('m03012', {
    // Baldur — Attack and Demise: Deal 1 damage to all allies, N times.
    hooks: {
      beforeAttack: baldur,
      demise: baldur,
    },
  }),
  ability('m03013', {
    // Sif — Whenever a Yggdrasil ally takes damage, give N random Yggdrasil allies +X/+X.
    hooks: {
      allyDamaged(b, me, ally) {
        if (ally.realm !== 'yggdrasil') return;
        const chosen = b.rng.sample(ofRealm(b.team(me), 'yggdrasil'), v(me.rank, [3, 3, 6]));
        if (!chosen.length) return;
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        for (const friend of chosen) b.buff(friend, gain, gain);
      },
    },
  }),
  ability('m03014', {
    // Bragi — After an ally slays an enemy, give allies on this row +X Attack.
    hooks: {
      allySlay(b, me) {
        b.trigger(me);
        const row = me.slot < 3 ? 0 : 1;
        for (const ally of b.team(me)) {
          if ((ally.slot < 3 ? 0 : 1) === row) b.buff(ally, v(me.rank, [3, 6, 12]), 0);
        }
      },
    },
  }),
  ability('m03015', {
    // Frigga — Safeguard. Cannot Attack. Takes damage for the ally in front (adjacent allies;
    // all allies), except Frigga.
    innate: always('safeguard', 'cannot_attack'),
    guard: (rank) => v(rank, ['front', 'adjacent', 'all'] as const),
  }),
  ability('m03016', {
    // Heimdall — Whenever an ally triggers Slay, all allies gain +X/+X.
    hooks: {
      allySlayTriggered(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [2, 4, 8]);
        for (const ally of b.team(me)) b.buff(ally, gain, gain);
      },
    },
  }),
  ability('m03017', {
    // Skadi — Ranged. Slay(1): Give N other allies +X Attack and trigger their Slay (except Skadi).
    innate: always('ranged'),
    hooks: {
      slay: slay(1, (b, me) => {
        const chosen = b.rng.sample(
          b.allies(me).filter((ally) => ally.unitId !== me.unitId),
          v(me.rank, [1, 2, 5]),
        );
        for (const ally of chosen) {
          b.buff(ally, v(me.rank, [8, 16, 24]), 0);
          b.triggerSlay(ally);
        }
      }),
    },
  }),
  ability('m03018', {
    // Tyr — Cleave. Whenever a Yggdrasil ally takes damage, this and adjacent allies gain +X/+X.
    innate: always('cleave'),
    hooks: {
      allyDamaged(b, me, ally) {
        if (ally.realm !== 'yggdrasil') return;
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        for (const friend of [me, ...b.adjacent(me)]) b.buff(friend, gain, gain);
      },
    },
  }),
  ability('m03019', {
    // Thor — Slay(1): Deal the excess damage to N enemies next to (adjacent to) the slain unit.
    hooks: {
      slay: slay(1, (b, me, victim, excess) => {
        if (!victim || excess <= 0) return;
        const around = me.rank === 0 ? b.nextTo(victim) : b.adjacent(victim);
        for (const enemy of b.rng.sample(around, v(me.rank, [1, 1, 2])))
          b.damage(me, enemy, excess);
      }),
    },
  }),
  ability('m03020', {
    // Valravn — Attack: Make the target (and N other enemies) Vulnerable.
    hooks: {
      beforeAttack(b, me, target) {
        b.trigger(me);
        b.grant(target, 'vulnerable');
        const others = b
          .foes(me)
          .filter((foe) => foe !== target && !foe.statuses.has('vulnerable'));
        for (const foe of b.rng.sample(others, v(me.rank, [0, 1, 2]))) b.grant(foe, 'vulnerable');
      },
    },
  }),
  ability('m03021', {
    // Hunter Huldra — Slay(1): Give another ally +X Health.
    hooks: {
      slay: slay(1, (b, me) => {
        const ally = b.rng.pick(b.allies(me));
        if (ally) b.buff(ally, 0, v(me.rank, [4, 8, 16]));
      }),
    },
  }),
  ability('m03022', {
    // Troll — Whenever this takes damage, gain +X Health (switching between Health and Attack).
    hooks: {
      damaged(b, me) {
        b.trigger(me);
        const gain = v(me.rank, [1, 2, 4]);
        if (alternate(me) === 0) b.buff(me, 0, gain);
        else b.buff(me, gain, 0);
      },
    },
  }),
];

/** Baldur's "Attack and Demise" text: it hurts its own side, which Yggdrasil turns into stats. */
function baldur(b: Battle, me: Fighter): void {
  b.trigger(me);
  for (let i = 0; i < v(me.rank, [1, 2, 3]); i++) {
    for (const ally of b.team(me)) if (ally !== me) b.damage(me, ally, 1);
  }
}
