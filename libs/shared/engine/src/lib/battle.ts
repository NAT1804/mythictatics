import {
  BOARD_COLUMNS,
  BOARD_SIZE,
  STATUS_CODES,
  type BattleEndReason,
  type BattleEvent,
  type BattleResult,
  type BattleSlot,
  type DamageKind,
  type FighterSnapshot,
  type MatchSetup,
  type Rank,
  type SideIndex,
  type StatusCode,
} from '@mythictatics/shared/contracts';
import { columnOf, resolveTargetOn, rowOf } from '@mythictatics/shared/domain';
import { DESCEND_ABILITIES, PATRON_POWERS, UNIT_ABILITIES } from './abilities';
import { Rng } from './rng';
import { EVENT_BUDGET, MAX_ATTACK_DEPTH, MAX_ROUNDS, MEDICINE_STATS_PER_TIER } from './rules';
import type { AbilityDef, CardLookup, Fighter, HookName, Hooks, Patron } from './types';
import { lowest, other } from './util';

/** Thrown when a fight blows through `EVENT_BUDGET`; caught by `run` and called a draw. */
class Overflow extends Error {}

interface SideState {
  /** "Your Burn deals N extra damage." */
  burnBonus: number;
  /** Named tallies an ability keeps for the whole side — allies slain, units summoned. */
  readonly counters: Map<string, number>;
}

interface SummonOptions {
  /** Where it should stand; the nearest free slot is used when that one is taken. */
  slot?: number;
  attack?: number;
  health?: number;
  statuses?: readonly StatusCode[];
  godId?: string | null;
  source?: Fighter | null;
  /** A Reborn copy: comes back without its Reborn, and fires the Reborn hooks. */
  reborn?: boolean;
}

/**
 * One fight, from the two boards to the event log. Build it, `run()` it once.
 *
 * The rules are written out in `libs/shared/engine/README.md`; this is them in code. The public
 * methods under "Effects" are the vocabulary card text is written in (`abilities/`), and each one
 * is the only path its effect takes — every hit goes through `damage`, every buff through `buff` —
 * so a keyword that reacts to a hit (Safeguard, Vulnerable, Last Chance, Lethal) reacts to all of
 * them, and the interaction between two keywords is decided once, here, rather than card by card.
 *
 * Deterministic by construction: no clock, no `Math.random`, and every list is walked in slot
 * order. The `Rng` is the only chance there is.
 */
export class Battle {
  readonly rng: Rng;
  readonly events: BattleEvent[] = [];
  round = 0;

  private readonly boards: [(Fighter | null)[], (Fighter | null)[]] = [
    Array.from({ length: BOARD_SIZE }, () => null),
    Array.from({ length: BOARD_SIZE }, () => null),
  ];
  private readonly patrons: [Patron | null, Patron | null] = [null, null];
  private readonly sides: [SideState, SideState] = [newSide(), newSide()];
  private readonly all: Fighter[] = [];
  private nextUid = 1;
  private deathSeq = 0;
  private attackDepth = 0;
  private resolving = false;
  /** Hits and deaths so far; a round that adds none is a stalemate. */
  private harm = 0;
  /** The ability whose hook is running, which is what a `trigger` event names. */
  private active = '';
  private ended: Extract<BattleEvent, { type: 'end' }> | null = null;

  constructor(
    readonly setup: MatchSetup,
    readonly cards: CardLookup,
  ) {
    this.rng = new Rng(setup.seed);
  }

  run(): BattleResult {
    if (this.events.length) throw new Error('A battle runs once');
    try {
      this.fight();
    } catch (error) {
      if (!(error instanceof Overflow)) throw error;
      this.finish('overflow');
    }
    const end = this.ended;
    if (!end) throw new Error('A battle always ends with an end event');
    const survivors: [FighterSnapshot[], FighterSnapshot[]] = [
      this.living(0).map(snapshot),
      this.living(1).map(snapshot),
    ];
    const damage =
      end.winner === null
        ? 0
        : this.living(end.winner).reduce((sum, fighter) => sum + fighter.tier, 0);
    return {
      setup: this.setup,
      winner: end.winner,
      rounds: end.rounds,
      reason: end.reason,
      survivors,
      damage,
      events: this.events,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // The fight
  // ---------------------------------------------------------------------------------------------

  private fight(): void {
    this.setup.sides.forEach((side, index) => this.deploy(index as SideIndex, side));

    // The fuller board opens; an even count is a coin flip — the fight's first draw.
    const [zero, one] = [this.living(0).length, this.living(1).length];
    const first: SideIndex = zero === one ? (this.rng.int(2) as SideIndex) : zero > one ? 0 : 1;
    const second = other(first);
    this.push({ type: 'start', fighters: this.all.map(snapshot), first });

    for (const side of [first, second]) {
      for (const fighter of this.living(side)) {
        this.runHook(fighter, 'startOfBattle');
        this.resolveDeaths();
      }
      this.runPatron(side, 'startOfBattle');
      this.resolveDeaths();
    }

    while (!this.isOver()) {
      if (this.round >= MAX_ROUNDS) return this.finish('rounds');
      this.round++;
      const harmBefore = this.harm;
      this.push({ type: 'round', round: this.round });
      for (const side of [first, second]) this.emit(side, 'roundStart', this.round);
      this.resolveDeaths();

      // Turns alternate between the sides, each walking its own board in slot order. A unit
      // summoned mid-round waits for the next one.
      const queues = [this.living(first), this.living(second)];
      const longest = Math.max(queues[0].length, queues[1].length);
      for (let index = 0; index < longest && !this.isOver(); index++) {
        for (const queue of queues) {
          const fighter = queue[index];
          if (fighter?.alive && !this.isOver()) this.takeTurn(fighter);
        }
      }
      if (!this.isOver() && this.harm === harmBefore) return this.finish('stalemate');
    }
    this.finish('wipe');
  }

  private deploy(side: SideIndex, input: MatchSetup['sides'][number]): void {
    const god = input.patronGodId ? this.cards.god(input.patronGodId) : undefined;
    if (input.patronGodId && !god) throw new Error(`Unknown god ${input.patronGodId}`);
    if (god) {
      this.patrons[side] = {
        side,
        god,
        power: PATRON_POWERS[god.id],
        uses: new Map(),
        memory: new Map(),
      };
    }
    input.board.forEach((slot, index) => {
      if (!slot) return;
      const godId = god && input.descendSlot === index ? god.id : null;
      this.place(this.createFighter(side, index, slot, godId));
    });
  }

  private createFighter(
    side: SideIndex,
    slot: number,
    input: BattleSlot,
    godId: string | null,
  ): Fighter {
    const unit = this.cards.unit(input.unitId);
    if (!unit) throw new Error(`Unknown unit ${input.unitId}`);
    const printed = unit.ranks[Math.min(input.rank, unit.ranks.length - 1)];
    const god = godId ? this.cards.god(godId) : undefined;
    const abilities: AbilityDef[] = [];
    const own = UNIT_ABILITIES[unit.id];
    if (own) abilities.push(own);
    const descend = god ? DESCEND_ABILITIES[god.id] : undefined;
    if (descend) abilities.push(descend);

    const statuses = new Set<StatusCode>();
    for (const ability of abilities) {
      for (const status of ability.innate?.(input.rank) ?? []) statuses.add(status);
    }
    for (const status of input.statuses ?? []) statuses.add(status);

    const godAttack = god?.attack ?? 0;
    const godHealth = god?.health ?? 0;
    return {
      uid: this.nextUid++,
      side,
      slot,
      unitId: unit.id,
      godId: god?.id ?? null,
      rank: input.rank,
      realm: unit.realm,
      tier: unit.tier,
      base: { attack: printed.attack + godAttack, health: printed.health + godHealth },
      attack: (input.attack ?? printed.attack) + godAttack,
      health: (input.health ?? printed.health) + godHealth,
      alive: true,
      statuses,
      burn: 0,
      burnSide: other(side),
      abilities,
      kills: 0,
      medicine: 0,
      uses: new Map(),
      memory: new Map(),
      dying: null,
      killer: null,
      excess: 0,
    };
  }

  private place(fighter: Fighter): void {
    this.boards[fighter.side][fighter.slot] = fighter;
    this.all.push(fighter);
  }

  private takeTurn(fighter: Fighter): void {
    this.push({ type: 'turn', uid: fighter.uid });
    if (this.canAttack(fighter)) this.performAttack(fighter);
    this.endTurn();
  }

  /** Burn ticks whenever any unit ends its turn — on both boards, front to back. */
  private endTurn(): void {
    for (const fighter of [...this.living(0), ...this.living(1)]) {
      if (fighter.burn <= 0 || !this.stands(fighter)) continue;
      this.damage(null, fighter, 1 + this.sides[fighter.burnSide].burnBonus, 'burn');
      fighter.burn--;
      this.push({ type: 'burn', uid: fighter.uid, turns: fighter.burn });
    }
    this.resolveDeaths();
  }

  private canAttack(fighter: Fighter): boolean {
    return this.stands(fighter) && fighter.attack > 0 && !fighter.statuses.has('cannot_attack');
  }

  /**
   * One attack: the "Attack:" text, then the allies that react to it, then the target's side,
   * then the hit itself — twice with Double Strike, each strike picking its target afresh.
   */
  private performAttack(attacker: Fighter, forced?: Fighter): void {
    if (this.attackDepth >= MAX_ATTACK_DEPTH) return;
    this.attackDepth++;
    try {
      let target = forced && this.stands(forced) ? forced : this.chooseTarget(attacker);
      if (!target) return;
      const strikes = attacker.statuses.has('double_strike') ? 2 : 1;
      for (let strike = 1; strike <= strikes; strike++) {
        if (!this.stands(attacker)) return;
        if (!target || !this.stands(target)) target = this.chooseTarget(attacker);
        if (!target) return;
        this.push({ type: 'attack', uid: attacker.uid, target: target.uid, strike });

        if (strike === 1) {
          this.runHook(attacker, 'beforeAttack', target);
          this.emit(attacker.side, 'allyAttacks', attacker, target);
          this.runHook(target, 'attacked', attacker);
          this.emit(target.side, 'allyAttacked', target, attacker);
          // Conceal is lost by attacking, after the "Attack:" text has had a chance to read it.
          this.strip(attacker, 'conceal');
          this.resolveDeaths();
          if (!this.stands(attacker)) return;
          if (!this.stands(target)) {
            target = this.chooseTarget(attacker);
            if (!target) return;
            this.push({ type: 'attack', uid: attacker.uid, target: target.uid, strike });
          }
        }

        this.exchange(attacker, target);
        this.resolveDeaths();
      }
    } finally {
      this.attackDepth--;
    }
  }

  /**
   * The hit and the counter-attack, simultaneous: both sides' Attack is read before either is
   * dealt, so a unit slain by the hit still strikes back. Ranged on either side means no counter.
   */
  private exchange(attacker: Fighter, target: Fighter): void {
    const counters = !attacker.statuses.has('ranged') && !target.statuses.has('ranged');
    if (counters) this.runHook(target, 'beforeCounter', attacker);
    if (!this.stands(attacker) || !this.stands(target)) return;

    const hit = attacker.attack;
    const back = counters ? target.attack : 0;
    const splash: Fighter[] = [];
    if (attacker.statuses.has('cleave')) splash.push(...this.nextTo(target));
    if (attacker.statuses.has('pierce')) {
      for (const behind of this.column(target.side, columnOf(target.slot))) {
        if (behind !== target && !splash.includes(behind)) splash.push(behind);
      }
    }

    this.damage(attacker, target, hit, 'attack');
    for (const struck of splash) this.damage(attacker, struck, hit, 'splash');
    if (back > 0) this.damage(target, attacker, back, 'counter');
  }

  private chooseTarget(attacker: Fighter): Fighter | null {
    const enemies = this.boards[other(attacker.side)];
    const targetable = (fighter: Fighter | null): fighter is Fighter =>
      !!fighter && this.stands(fighter) && !fighter.statuses.has('conceal');

    if (attacker.abilities.some((ability) => ability.targeting === 'lowest-health')) {
      return lowest(enemies.filter(targetable), (fighter) => fighter.health);
    }
    const result = resolveTargetOn(attacker.slot, {
      targetable: (index) => targetable(enemies[index]),
      hasTaunt: (index) => !!enemies[index]?.statuses.has('taunt'),
    });
    return result ? enemies[result.index] : null;
  }

  // ---------------------------------------------------------------------------------------------
  // Deaths
  // ---------------------------------------------------------------------------------------------

  private markDying(fighter: Fighter, killer: Fighter | null, excess: number): void {
    if (fighter.dying !== null) return;
    fighter.dying = ++this.deathSeq;
    fighter.killer = killer;
    fighter.excess = excess;
  }

  /**
   * Takes every fighter at 0 Health off the board, in the order they got there, until none is
   * left — a Demise can kill in its turn, and those deaths are resolved in the same pass.
   */
  resolveDeaths(): void {
    if (this.resolving) return;
    this.resolving = true;
    try {
      for (;;) {
        const dying = this.all
          .filter((fighter) => fighter.alive && fighter.health <= 0)
          .sort((one, two) => (one.dying ?? 0) - (two.dying ?? 0));
        if (!dying.length) break;
        for (const fighter of dying) this.processDeath(fighter);
      }
    } finally {
      this.resolving = false;
    }
  }

  /**
   * A death, in the order the README fixes: off the board; the killer's Slay; Reborn back into the
   * same slot; the unit's own Demise; then everything that reacts to an ally or an enemy dying.
   */
  private processDeath(fighter: Fighter): void {
    fighter.alive = false;
    this.boards[fighter.side][fighter.slot] = null;
    this.harm++;
    this.count(fighter.side, 'slain');
    this.count(fighter.side, `slain:${fighter.realm}`);
    const killer = fighter.killer;
    this.push({ type: 'death', uid: fighter.uid, killer: killer?.uid ?? null });

    if (killer && killer.side !== fighter.side && this.stands(killer)) {
      killer.kills++;
      this.runHook(killer, 'slay', fighter, fighter.excess);
      this.emit(killer.side, 'allySlay', killer, fighter);
    }

    if (fighter.statuses.has('reborn')) {
      const keep = fighter.statuses.has('reborn_keep_attack');
      this.summon(fighter.side, fighter.unitId, fighter.rank, {
        slot: fighter.slot,
        attack: keep ? fighter.attack : fighter.base.attack,
        health: 1,
        godId: fighter.godId,
        source: fighter,
        reborn: true,
      });
    }

    const echoes = this.living(fighter.side).reduce(
      (sum, ally) =>
        sum +
        ally.abilities.reduce(
          (more, ability) => more + (ability.demiseEchoes?.(ally.rank) ?? 0),
          0,
        ),
      0,
    );
    for (let time = 0; time <= echoes; time++) this.runHook(fighter, 'demise', killer);

    this.emit(fighter.side, 'allyDied', fighter, killer);
    this.emit(other(fighter.side), 'enemyDied', fighter, killer);
  }

  // ---------------------------------------------------------------------------------------------
  // Effects: the vocabulary card text is written in
  // ---------------------------------------------------------------------------------------------

  /**
   * Every hit in the game, whatever dealt it. In order: a guardian may take it instead; Safeguard
   * stops it outright (and so stops Lethal, which needs damage dealt); Vulnerable doubles it;
   * Lethal or Venomous turn it into a kill; Last Chance leaves the unit on 1.
   */
  damage(
    source: Fighter | null,
    target: Fighter,
    amount: number,
    kind: DamageKind = 'effect',
  ): number {
    if (!this.stands(target) || amount <= 0) return 0;
    if (kind !== 'burn') target = this.guardianOf(target) ?? target;

    if (target.statuses.has('safeguard')) {
      this.harm++;
      this.push({
        type: 'damage',
        uid: target.uid,
        source: source?.uid ?? null,
        amount,
        health: target.health,
        kind,
        blocked: true,
      });
      this.strip(target, 'safeguard');
      return 0;
    }

    if (target.statuses.has('vulnerable')) {
      amount *= 2;
      this.strip(target, 'vulnerable');
    }

    const byAttack = kind === 'attack' || kind === 'counter' || kind === 'splash';
    let lethal = false;
    if (source && source !== target) {
      if (source.statuses.has('lethal')) lethal = this.strip(source, 'lethal');
      else if (byAttack && source.statuses.has('venomous')) lethal = this.strip(source, 'venomous');
    }

    const before = target.health;
    target.health -= amount;
    if (lethal) target.health = Math.min(target.health, 0);
    let saved = false;
    if (target.health <= 0 && target.statuses.has('last_chance')) {
      target.health = 1;
      saved = true;
    }
    this.harm++;
    this.push({
      type: 'damage',
      uid: target.uid,
      source: source?.uid ?? null,
      amount,
      health: target.health,
      kind,
      ...(lethal ? { lethal: true as const } : {}),
      ...(saved ? { saved: true as const } : {}),
    });
    if (saved) this.strip(target, 'last_chance');

    if (target.health <= 0) this.markDying(target, source, Math.max(0, amount - before));
    else this.runHook(target, 'damaged', amount, source);
    this.emit(target.side, 'allyDamaged', target, amount, source);
    if (source) this.emit(source.side, 'allyDealtDamage', source, target, amount);
    return amount;
  }

  /** Destroy: not damage, so nothing that stops damage stops it. */
  destroy(target: Fighter, source: Fighter | null): void {
    if (!this.stands(target)) return;
    this.harm++;
    this.push({
      type: 'damage',
      uid: target.uid,
      source: source?.uid ?? null,
      amount: target.health,
      health: 0,
      kind: 'effect',
      lethal: true,
    });
    target.health = 0;
    this.markDying(target, source, 0);
  }

  /** Stats gained (or, with a negative, lost) for the rest of the battle. */
  buff(target: Fighter, attack: number, health: number): void {
    if (!this.stands(target) || (attack === 0 && health === 0)) return;
    for (const ability of target.abilities) {
      const bonus = ability.gainBonus?.(target.rank);
      if (!bonus) continue;
      if (attack > 0) attack += bonus[0];
      if (health > 0) health += bonus[1];
    }
    this.setStats(target, target.attack + attack, target.health + health);
  }

  setStats(target: Fighter, attack: number, health: number): void {
    if (!this.stands(target)) return;
    target.attack = Math.max(0, attack);
    target.health = health;
    this.push({ type: 'stats', uid: target.uid, attack: target.attack, health: target.health });
    if (target.health <= 0) this.markDying(target, null, 0);
  }

  /** Returns whether the status was new. */
  grant(target: Fighter, status: StatusCode): boolean {
    if (!this.stands(target) || target.statuses.has(status)) return false;
    target.statuses.add(status);
    this.push({ type: 'status', uid: target.uid, status, on: true });
    if (status === 'safeguard') this.emit(target.side, 'allyGainedSafeguard', target);
    return true;
  }

  /** Returns whether the unit had it. */
  strip(target: Fighter, status: StatusCode): boolean {
    if (!target.statuses.has(status)) return false;
    target.statuses.delete(status);
    this.push({ type: 'status', uid: target.uid, status, on: false });
    if (status === 'safeguard') {
      this.runHook(target, 'lostSafeguard');
      this.emit(target.side, 'allyLostSafeguard', target);
    } else if (status === 'conceal') {
      this.runHook(target, 'lostConceal');
      this.emit(target.side, 'allyLostConceal', target);
    }
    return true;
  }

  /** Burn(X): the longer of the Burn it had and X, owned by whoever lit it last. */
  burn(target: Fighter, turns: number, bySide: SideIndex): void {
    if (!this.stands(target) || turns <= 0) return;
    target.burn = Math.max(target.burn, turns);
    target.burnSide = bySide;
    this.push({ type: 'burn', uid: target.uid, turns: target.burn });
  }

  addBurnBonus(side: SideIndex, amount: number): void {
    this.sides[side].burnBonus += amount;
  }

  /**
   * Casts a Celestial Medicine in battle.
   *
   * The game's Medicines are worth `{0}`/`{1}` — numbers it works out at runtime and the dataset
   * does not carry. Until the economy exists to compute them, a Medicine of Tier T is +T/+T times
   * `MEDICINE_STATS_PER_TIER`: a placeholder that keeps the cards that cast and count Medicine
   * playable, and one constant to rebalance.
   */
  castMedicine(target: Fighter, tier: number, echo = false): void {
    if (!this.stands(target)) return;
    const amount = tier * MEDICINE_STATS_PER_TIER;
    this.buff(target, amount, amount);
    target.medicine++;
    this.runHook(target, 'medicine', tier, echo);
  }

  /** A random Medicine Tier from 1 to `upTo`. */
  medicineTier(upTo: number): number {
    return 1 + this.rng.int(upTo);
  }

  /**
   * Puts a new fighter on a board, or does nothing when the board is full. Summoned units are
   * born at the start of their text — a Reborn copy of a Taunt is a Taunt — and act from the
   * next round.
   */
  summon(side: SideIndex, unitId: string, rank: Rank, options: SummonOptions = {}): Fighter | null {
    const slot = this.freeSlot(side, options.slot ?? 0);
    if (slot === null) return null;
    const fighter = this.createFighter(
      side,
      slot,
      {
        unitId,
        rank,
        attack: options.attack,
        health: options.health,
        statuses: options.statuses ? [...options.statuses] : undefined,
      },
      options.godId ?? null,
    );
    if (options.reborn) {
      fighter.statuses.delete('reborn');
      fighter.statuses.delete('reborn_keep_attack');
    }
    this.place(fighter);
    this.harm++;
    this.push({
      type: 'summon',
      fighter: snapshot(fighter),
      source: options.source?.uid ?? null,
      reborn: !!options.reborn,
    });
    this.count(side, 'summoned');
    this.count(side, `summoned:${fighter.realm}`);
    if (options.reborn) {
      this.runHook(fighter, 'reborn');
      this.emit(side, 'allyReborn', fighter);
    }
    this.emit(side, 'allySummoned', fighter);
    return fighter;
  }

  /** "Attack immediately": an attack out of turn, which ends no turn and so ticks no Burn. */
  attackNow(fighter: Fighter, target?: Fighter): void {
    if (this.canAttack(fighter)) this.performAttack(fighter, target);
  }

  /** Fires a unit's Demise text without it dying — Cat Archer's trick. */
  triggerDemise(fighter: Fighter): void {
    this.runHook(fighter, 'demise', null);
  }

  /** Fires a unit's Slay text without a kill — Skadi's. */
  triggerSlay(fighter: Fighter): void {
    this.runHook(fighter, 'slay', null, 0);
  }

  /** Called by a Slay text when it fires, for the cards that react to a Slay (Heimdall). */
  slayed(fighter: Fighter): void {
    this.emit(fighter.side, 'allySlayTriggered', fighter);
  }

  /** Emits a `trigger` event naming the card whose text is running: the renderer's "it fired". */
  trigger(holder: Fighter | Patron): void {
    this.push({
      type: 'trigger',
      uid: 'uid' in holder ? holder.uid : null,
      side: holder.side,
      source: this.active,
    });
  }

  /**
   * True, and counted, while the running ability is under its "(N times per battle)" limit.
   * `key` separates two limits one card keeps apart.
   */
  uses(holder: Fighter | Patron, limit: number, key = this.active): boolean {
    const used = holder.uses.get(key) ?? 0;
    if (used >= limit) return false;
    holder.uses.set(key, used + 1);
    return true;
  }

  /** A side's named tally; `by` of 0 reads it. */
  count(side: SideIndex, key: string, by = 1): number {
    const counters = this.sides[side].counters;
    const next = (counters.get(key) ?? 0) + by;
    counters.set(key, next);
    return next;
  }

  // ---------------------------------------------------------------------------------------------
  // Reading the board
  // ---------------------------------------------------------------------------------------------

  /** Still on the board and not yet at 0 Health: what can act, be targeted or be buffed. */
  stands(fighter: Fighter): boolean {
    return fighter.alive && fighter.health > 0;
  }

  /** A side's standing fighters, in slot order. */
  living(side: SideIndex): Fighter[] {
    return this.boards[side].filter(
      (fighter): fighter is Fighter => !!fighter && this.stands(fighter),
    );
  }

  /** `me` and its allies. */
  team(me: Fighter): Fighter[] {
    return this.living(me.side);
  }

  /** `me`'s allies, not `me`. */
  allies(me: Fighter): Fighter[] {
    return this.living(me.side).filter((fighter) => fighter !== me);
  }

  foes(of: Fighter | SideIndex): Fighter[] {
    return this.living(other(typeof of === 'number' ? of : of.side));
  }

  /**
   * The units either side of `fighter` in its row. Works off the slot, so it also answers for a
   * unit that has just died — "the enemies next to the slain unit".
   */
  nextTo(fighter: Pick<Fighter, 'side' | 'slot'>): Fighter[] {
    const row = rowOf(fighter.slot);
    return [fighter.slot - 1, fighter.slot + 1]
      .filter((slot) => slot >= 0 && slot < BOARD_SIZE && rowOf(slot) === row)
      .map((slot) => this.at(fighter.side, slot))
      .filter((found): found is Fighter => !!found);
  }

  /** Next to it in its row, plus the unit in front of or behind it. */
  adjacent(fighter: Pick<Fighter, 'side' | 'slot'>): Fighter[] {
    const across =
      rowOf(fighter.slot) === 'front' ? fighter.slot + BOARD_COLUMNS : fighter.slot - BOARD_COLUMNS;
    const facing = this.at(fighter.side, across);
    return facing ? [...this.nextTo(fighter), facing] : this.nextTo(fighter);
  }

  /** The ally in front of `fighter`, when it stands in the back row. */
  inFront(fighter: Fighter): Fighter | null {
    return rowOf(fighter.slot) === 'back'
      ? this.at(fighter.side, fighter.slot - BOARD_COLUMNS)
      : null;
  }

  /** A side's standing units in one column, front first. */
  column(side: SideIndex, column: number): Fighter[] {
    return [column, column + BOARD_COLUMNS]
      .map((slot) => this.at(side, slot))
      .filter((found): found is Fighter => !!found);
  }

  /** The enemy facing `fighter` across the board: its column's front, else its back. */
  opposite(fighter: Fighter): Fighter | null {
    return this.column(other(fighter.side), columnOf(fighter.slot))[0] ?? null;
  }

  at(side: SideIndex, slot: number): Fighter | null {
    const fighter = this.boards[side][slot];
    return fighter && this.stands(fighter) ? fighter : null;
  }

  patron(side: SideIndex): Patron | null {
    return this.patrons[side];
  }

  // ---------------------------------------------------------------------------------------------
  // Plumbing
  // ---------------------------------------------------------------------------------------------

  private guardianOf(target: Fighter): Fighter | null {
    for (const ally of this.allies(target)) {
      for (const ability of ally.abilities) {
        const reach = ability.guard?.(ally.rank);
        if (!reach || target.unitId === ally.unitId) continue;
        const covers =
          reach === 'all' ||
          (reach === 'front' && this.inFront(ally) === target) ||
          (reach === 'adjacent' && this.adjacent(ally).includes(target));
        if (covers) return ally;
      }
    }
    return null;
  }

  /** `preferred` when it is free, else the nearest free slot (ties to the lower index). */
  private freeSlot(side: SideIndex, preferred: number): number | null {
    const board = this.boards[side];
    const free = (slot: number) => !board[slot]?.alive;
    if (free(preferred)) return preferred;
    const distance = (slot: number) =>
      Math.abs(columnOf(slot) - columnOf(preferred)) + (rowOf(slot) === rowOf(preferred) ? 0 : 1);
    const candidates = Array.from({ length: BOARD_SIZE }, (_, slot) => slot).filter(free);
    candidates.sort((one, two) => distance(one) - distance(two) || one - two);
    return candidates[0] ?? null;
  }

  private runHook(fighter: Fighter, hook: HookName, ...args: unknown[]): void {
    for (const ability of [...fighter.abilities])
      this.call(ability.id, ability.hooks, hook, fighter, args);
  }

  private runPatron(side: SideIndex, hook: HookName, ...args: unknown[]): void {
    const patron = this.patrons[side];
    if (patron?.power) this.call(patron.power.id, patron.power.hooks, hook, patron, args);
  }

  /** Fires an `ally*` hook on every standing fighter of a side, then on its patron's Power. */
  private emit(side: SideIndex, hook: HookName, ...args: unknown[]): void {
    for (const fighter of this.living(side)) {
      if (this.stands(fighter)) this.runHook(fighter, hook, ...args);
    }
    this.runPatron(side, hook, ...args);
  }

  private call<Self>(
    id: string,
    hooks: Hooks<Self> | undefined,
    hook: HookName,
    self: Self,
    args: unknown[],
  ): void {
    const handler = hooks?.[hook] as
      ((b: Battle, me: Self, ...rest: unknown[]) => void) | undefined;
    if (!handler) return;
    const previous = this.active;
    this.active = id;
    try {
      handler(this, self, ...args);
    } finally {
      this.active = previous;
    }
  }

  private isOver(): boolean {
    return !!this.ended || !this.living(0).length || !this.living(1).length;
  }

  private finish(reason: BattleEndReason): void {
    if (this.ended) return;
    const [zero, one] = [this.living(0).length, this.living(1).length];
    const winner: SideIndex | null = reason !== 'wipe' || zero === one ? null : zero > one ? 0 : 1;
    this.ended = { type: 'end', winner, rounds: this.round, reason };
    // Pushed past the budget on purpose: an overflowed fight still ends with its `end`.
    this.events.push(this.ended);
  }

  private push(event: BattleEvent): void {
    if (this.events.length >= EVENT_BUDGET) throw new Overflow();
    this.events.push(event);
  }
}

function newSide(): SideState {
  return { burnBonus: 0, counters: new Map() };
}

const STATUS_ORDER = new Map(STATUS_CODES.map((code, index) => [code, index]));

export function snapshot(fighter: Fighter): FighterSnapshot {
  return {
    uid: fighter.uid,
    side: fighter.side,
    slot: fighter.slot,
    unitId: fighter.unitId,
    godId: fighter.godId,
    rank: fighter.rank,
    attack: fighter.attack,
    health: fighter.health,
    statuses: [...fighter.statuses].sort(
      (one, two) => (STATUS_ORDER.get(one) ?? 0) - (STATUS_ORDER.get(two) ?? 0),
    ),
    burn: fighter.burn,
  };
}
