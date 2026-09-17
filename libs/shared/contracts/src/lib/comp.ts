import { z } from 'zod';
import { BoardSchema } from './board';
import { NEUTRAL_REALM } from './constants';
import { GodIdSchema, UnitIdSchema } from './ids';
import { GameVersionSchema, SlugSchema } from './primitives';
import { RealmCodeSchema } from './realm';

export const CompDifficultySchema = z.enum(['basic', 'advanced']);
export type CompDifficulty = z.infer<typeof CompDifficultySchema>;

export const CompSourceSchema = z.object({
  type: z.enum(['sheet', 'user']),
  url: z.url().optional(),
  author: z.string().optional(),
});
export type CompSource = z.infer<typeof CompSourceSchema>;

/**
 * A team composition guide. Mirrors the community comp-sheet template (`tools/comps/`).
 *
 * The comp names cards by id and nothing else. A god's Power, a unit's name or its realm are read
 * off the card, so a patch that renames one does not leave a stale copy here.
 */
export const CompSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  name: z.string().min(1),
  difficulty: CompDifficultySchema,
  /** Empty array means any Patron God works. */
  patronGodIds: z.array(GodIdSchema),
  /**
   * The realms to draft, without Neutral — every draft has Neutral already. Empty means the comp
   * is Neutral at its core and the rest of the draft is open.
   */
  realms: z.array(RealmCodeSchema.exclude([NEUTRAL_REALM])).max(3),
  whenToCommit: z.string().nullable(),
  /** A `null` slot is a flexible pick: the sheet says "Any", or leaves the slot open. */
  idealBoard: BoardSchema,
  alternativeBoards: z.array(BoardSchema),
  coreUnitIds: z.array(UnitIdSchema),
  enablerUnitIds: z.array(UnitIdSchema),
  addOnUnitIds: z.array(UnitIdSchema),
  /**
   * Plain text, paragraphs separated by a blank line. Deliberately not Markdown: comp text comes
   * from a community sheet, and rendering it as text is what keeps it out of `innerHTML`.
   */
  howToPlay: z.string(),
  tags: z.array(SlugSchema),
  gameVersion: GameVersionSchema,
  source: CompSourceSchema,
  updatedAt: z.iso.datetime(),
});
export type Comp = z.infer<typeof CompSchema>;
