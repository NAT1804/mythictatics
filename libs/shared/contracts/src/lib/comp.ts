import { z } from 'zod';
import { BoardSchema } from './board';
import { GameVersionSchema, SlugSchema } from './card';
import { GOD_ID_PATTERN, UNIT_ID_PATTERN } from './constants';
import { RealmCodeSchema } from './realm';

const UnitIdSchema = z.string().regex(UNIT_ID_PATTERN);

export const CompDifficultySchema = z.enum(['basic', 'advanced']);
export type CompDifficulty = z.infer<typeof CompDifficultySchema>;

export const CompSourceSchema = z.object({
  type: z.enum(['sheet', 'user']),
  url: z.url().optional(),
  author: z.string().optional(),
});

/** A team composition guide. Mirrors the community comp-sheet template. */
export const CompSchema = z.object({
  id: z.string().min(1),
  slug: SlugSchema,
  name: z.string().min(1),
  difficulty: CompDifficultySchema,
  /** Empty array means any Patron God works. */
  patronGodIds: z.array(z.string().regex(GOD_ID_PATTERN)),
  godPower: z.string().nullable(),
  realms: z.array(RealmCodeSchema),
  whenToCommit: z.string().nullable(),
  idealBoard: BoardSchema,
  alternativeBoards: z.array(BoardSchema),
  coreUnitIds: z.array(UnitIdSchema),
  enablerUnitIds: z.array(UnitIdSchema),
  addOnUnitIds: z.array(UnitIdSchema),
  /** Markdown. */
  howToPlay: z.string(),
  tags: z.array(SlugSchema),
  gameVersion: GameVersionSchema,
  source: CompSourceSchema,
  updatedAt: z.iso.datetime(),
});
export type Comp = z.infer<typeof CompSchema>;
