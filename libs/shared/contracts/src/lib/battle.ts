import { z } from 'zod';
import { BOARD_SIZE, STATUS_CODES, type SideIndex, type StatusCode } from './constants';
import { GodIdSchema, UnitIdSchema } from './ids';
import { GameVersionSchema, RankSchema, type Rank } from './primitives';

/**
 * A battle, as the engine in `@mythictatics/shared/engine` takes it in and gives it back.
 *
 * ## A setup is the replay
 *
 * The engine is deterministic, so `{ engineVersion, seed, sides }` is all a fight is: run it again
 * and every event comes back the same, in the browser or on a Worker. Nothing else needs storing
 * to watch a battle again, and nothing a client reports about how a battle went needs trusting —
 * the server runs the same setup itself.
 *
 * `engineVersion` is the engine's own version, not the game's. A replay is only faithful to the
 * rules it was fought under, so a balance change that moves the version leaves old replays
 * labelled with the rules they need.
 */

export const StatusCodeSchema = z.enum(STATUS_CODES);

/**
 * One unit as it goes into a fight.
 *
 * A board slot and nothing more is a unit at its Rank's printed body. The optional fields are
 * whatever the unit picked up before the battle — a shop's buffs, a spell's Taunt — and are left
 * out entirely when there is none, so a plain board from a share code is already a battle slot.
 */
export const BattleSlotSchema = z.object({
  unitId: UnitIdSchema,
  rank: RankSchema,
  /** The unit's Attack going in, replacing its Rank's. */
  attack: z.number().int().nonnegative().optional(),
  /** Likewise Health; a unit cannot go into a battle already dead. */
  health: z.number().int().positive().optional(),
  /** Granted on top of the unit's own. */
  statuses: z.array(StatusCodeSchema).optional(),
});
export type BattleSlot = z.infer<typeof BattleSlotSchema>;

export const BattleSideSchema = z.object({
  board: z.array(BattleSlotSchema.nullable()).length(BOARD_SIZE),
  patronGodId: GodIdSchema.nullable(),
  /**
   * The slot the patron came down on, or null for a patron that stayed a Power. Must hold a unit:
   * a god fights in a unit's seat, never in one of its own.
   */
  descendSlot: z
    .number()
    .int()
    .min(0)
    .max(BOARD_SIZE - 1)
    .nullable(),
});
export type BattleSide = z.infer<typeof BattleSideSchema>;

export const MatchSetupSchema = z
  .object({
    engineVersion: GameVersionSchema,
    /** A 32-bit unsigned integer, the only source of chance in the fight. */
    seed: z.number().int().min(0).max(0xffffffff),
    sides: z.tuple([BattleSideSchema, BattleSideSchema]),
  })
  .refine(
    (setup) =>
      setup.sides.every((side) => side.descendSlot === null || side.board[side.descendSlot]),
    { message: 'A patron can only descend onto a slot that holds a unit', path: ['sides'] },
  );
export type MatchSetup = z.infer<typeof MatchSetupSchema>;

/**
 * A fighter as the renderer first sees it — at the start, or when it is summoned mid-fight.
 *
 * `uid` is unique for the whole battle and never reused: a Reborn copy standing in the slot its
 * original died in is a new fighter, so an event about the one can never be mistaken for the other.
 */
export interface FighterSnapshot {
  uid: number;
  side: SideIndex;
  slot: number;
  unitId: string;
  /** The patron standing in this unit's seat, when it descended here. */
  godId: string | null;
  rank: Rank;
  attack: number;
  health: number;
  statuses: StatusCode[];
  burn: number;
}

/** Where a hit came from. The renderer draws each differently; the engine treats them alike. */
export type DamageKind = 'attack' | 'counter' | 'splash' | 'effect' | 'burn';

export type BattleEndReason =
  /** One side has nothing left standing. */
  | 'wipe'
  /** The round limit ran out. */
  | 'rounds'
  /** A full round went by with nobody able to hurt anybody. */
  | 'stalemate'
  /** The fight hit the engine's event budget — a runaway chain of triggers, called a draw. */
  | 'overflow';

/**
 * The event log: the only thing the engine and a renderer share.
 *
 * Every event carries the values it leaves behind (`health` after the hit, the new `attack`), so
 * a renderer never re-derives a rule — it replays the log, and whatever it draws is what the
 * engine decided. `source` on a trigger is the id of the card whose text fired (`m01001`, a god's
 * `champ002`), or a keyword's key for the rules every card shares.
 */
export type BattleEvent =
  | { type: 'start'; fighters: FighterSnapshot[]; first: SideIndex }
  | { type: 'round'; round: number }
  | { type: 'turn'; uid: number }
  | { type: 'attack'; uid: number; target: number; strike: number }
  | { type: 'trigger'; uid: number | null; side: SideIndex; source: string }
  | {
      type: 'damage';
      uid: number;
      source: number | null;
      amount: number;
      health: number;
      kind: DamageKind;
      /** Safeguard took the hit: `amount` is what it stopped, and Health did not move. */
      blocked?: true;
      /** Lethal or Venomous destroyed the unit whatever its Health. */
      lethal?: true;
      /** Last Chance left the unit on 1 Health. */
      saved?: true;
    }
  | { type: 'stats'; uid: number; attack: number; health: number }
  | { type: 'status'; uid: number; status: StatusCode; on: boolean }
  | { type: 'burn'; uid: number; turns: number }
  | { type: 'summon'; fighter: FighterSnapshot; source: number | null; reborn: boolean }
  | { type: 'death'; uid: number; killer: number | null }
  | { type: 'end'; winner: SideIndex | null; rounds: number; reason: BattleEndReason };

export type BattleEventType = BattleEvent['type'];

/** What a battle came to. `events` is the whole fight; the rest is read off its last state. */
export interface BattleResult {
  setup: MatchSetup;
  winner: SideIndex | null;
  rounds: number;
  reason: BattleEndReason;
  /** Each side's fighters still standing at the end. */
  survivors: [FighterSnapshot[], FighterSnapshot[]];
  /**
   * What the loser would pay in an auto-battler's life total: the Tiers of the winner's
   * survivors. Zero on a draw. Nothing spends it yet; it is here so a run can.
   */
  damage: number;
  events: BattleEvent[];
}
