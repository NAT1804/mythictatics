import type {
  God,
  Rank,
  RealmCode,
  SideIndex,
  StatusCode,
  Unit,
} from '@mythictatics/shared/contracts';
import type { Battle } from './battle';

/**
 * The cards a battle can meet: the ones on the two boards, and whatever those can summon.
 *
 * The engine reads the `Card` layer rather than the dataset — the same `Unit` and `God` the site
 * renders — so it never has to parse markup or pick a locale, and a test can hand it any list.
 */
export interface CardLookup {
  unit(id: string): Unit | undefined;
  god(id: string): God | undefined;
  /** Every unit, for the effects that summon "a random Babylon unit". */
  readonly units: readonly Unit[];
  readonly gods: readonly God[];
}

/** One unit in a fight, from the moment it is on a board until the battle ends. */
export interface Fighter {
  readonly uid: number;
  readonly side: SideIndex;
  slot: number;
  readonly unitId: string;
  /** The patron standing in this seat, when it descended onto the unit. */
  readonly godId: string | null;
  readonly rank: Rank;
  readonly realm: RealmCode;
  readonly tier: number;
  /** The body a "base copy" comes back with: the Rank's printed stats, plus the god's if any. */
  readonly base: { readonly attack: number; readonly health: number };
  attack: number;
  health: number;
  /** False from the moment it has been taken off the board. */
  alive: boolean;
  readonly statuses: Set<StatusCode>;
  /** Burn turns left; 0 is not burning. */
  burn: number;
  /** Whose Burn it is, which decides whose extra Burn damage applies. */
  burnSide: SideIndex;
  /** The card texts this fighter carries: its own, a god's Descend, and any it was granted. */
  readonly abilities: AbilityDef[];
  /** Enemies this has slain, which is what Slay(X) counts. */
  kills: number;
  /** Celestial Medicine this has received in the battle. */
  medicine: number;
  /** How often each ability has fired, for the "(N times per battle)" limits. */
  readonly uses: Map<string, number>;
  /** Scratch space an ability keeps between triggers — an alternating stat, a count. */
  readonly memory: Map<string, number>;
  /** Set once Health reaches 0; deaths are resolved in this order. */
  dying: number | null;
  killer: Fighter | null;
  /** Damage past what it took to kill, for Thor. */
  excess: number;
}

/** A patron god, whether it descended or stayed a Power. */
export interface Patron {
  readonly side: SideIndex;
  readonly god: God;
  readonly power: PatronDef | undefined;
  readonly uses: Map<string, number>;
  readonly memory: Map<string, number>;
}

/**
 * The moments a card's text can hook into. `me` is the card that carries the text.
 *
 * The `ally*` hooks fire on every living fighter of a side — `me` included, since most text that
 * says "an ally" means any of them. Text that says "another" or "a different" ally checks for
 * itself. A hook that reads the ally's Health checks it: an ally hit for more than it had is
 * still in the list until its death has been resolved.
 */
export interface Hooks<Self> {
  startOfBattle?(b: Battle, me: Self): void;
  roundStart?(b: Battle, me: Self, round: number): void;
  /** "Attack:" — right before this attacks, once per attack even with Double Strike. */
  beforeAttack?(b: Battle, me: Self, target: Fighter): void;
  /** "Counter:" — right before this counter-attacks. */
  beforeCounter?(b: Battle, me: Self, attacker: Fighter): void;
  /** This was picked as an attack's target. */
  attacked?(b: Battle, me: Self, attacker: Fighter): void;
  /** This took damage and lived. */
  damaged?(b: Battle, me: Self, amount: number, source: Fighter | null): void;
  /**
   * This slew `victim`. `victim` is null when another card made the Slay fire (Skadi), which
   * fires every threshold at once and has no body to measure from.
   */
  slay?(b: Battle, me: Self, victim: Fighter | null, excess: number): void;
  /** "Demise:" — this was slain. Also fired by effects that trigger a Demise on a living unit. */
  demise?(b: Battle, me: Self, killer: Fighter | null): void;
  /** This is a Reborn copy, just summoned. */
  reborn?(b: Battle, me: Self): void;
  lostSafeguard?(b: Battle, me: Self): void;
  lostConceal?(b: Battle, me: Self): void;
  /** Celestial Medicine was cast on this. `echo` is a copy another card passed on. */
  medicine?(b: Battle, me: Self, tier: number, echo: boolean): void;

  allyAttacks?(b: Battle, me: Self, attacker: Fighter, target: Fighter): void;
  allyAttacked?(b: Battle, me: Self, ally: Fighter, attacker: Fighter): void;
  allyDamaged?(b: Battle, me: Self, ally: Fighter, amount: number, source: Fighter | null): void;
  allyDealtDamage?(b: Battle, me: Self, dealer: Fighter, target: Fighter, amount: number): void;
  allySlay?(b: Battle, me: Self, killer: Fighter, victim: Fighter): void;
  allySlayTriggered?(b: Battle, me: Self, ally: Fighter): void;
  allyDied?(b: Battle, me: Self, dead: Fighter, killer: Fighter | null): void;
  enemyDied?(b: Battle, me: Self, dead: Fighter, killer: Fighter | null): void;
  allySummoned?(b: Battle, me: Self, unit: Fighter): void;
  allyReborn?(b: Battle, me: Self, copy: Fighter): void;
  allyGainedSafeguard?(b: Battle, me: Self, ally: Fighter): void;
  allyLostSafeguard?(b: Battle, me: Self, ally: Fighter): void;
  allyLostConceal?(b: Battle, me: Self, ally: Fighter): void;
}

export type HookName = keyof Hooks<unknown>;

/** Who takes a hit meant for someone else — Frigga's text, by Rank. */
export type GuardReach = 'front' | 'adjacent' | 'all';

/**
 * A card's text, as far as a battle is concerned.
 *
 * Keyed by card id in the registry (`abilities/`), so the mechanic lives in code and the words
 * stay in the dataset: re-theming a card is a data change, and the id is the join.
 */
export interface AbilityDef {
  /** The card whose text this is — what a `trigger` event names as its source. */
  readonly id: string;
  /** Keywords the card is born with at a Rank: its Taunt, its Ranged, its Reborn. */
  readonly innate?: (rank: Rank) => readonly StatusCode[];
  /** Picks its own target instead of following the board's targeting rule. */
  readonly targeting?: 'lowest-health';
  /** "Whenever this gains stats, add +A/+H to that amount." */
  readonly gainBonus?: (rank: Rank) => readonly [number, number];
  /** Takes damage meant for these allies. */
  readonly guard?: (rank: Rank) => GuardReach;
  /** Aura: allies' Demise effects fire this many extra times. */
  readonly demiseEchoes?: (rank: Rank) => number;
  readonly hooks?: Hooks<Fighter>;
}

/** A patron's Power, where it does something in a fight. Most are about the shop and do not. */
export interface PatronDef {
  readonly id: string;
  readonly hooks: Hooks<Patron>;
}
