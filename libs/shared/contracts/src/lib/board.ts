import { z } from 'zod';
import { BOARD_SIZE } from './constants';
import { GodIdSchema, UnitIdSchema } from './ids';
import { RankSchema } from './primitives';

export const BoardSlotSchema = z.object({
  unitId: UnitIdSchema,
  rank: RankSchema,
});
export type BoardSlot = z.infer<typeof BoardSlotSchema>;

export const BoardSchema = z.array(BoardSlotSchema.nullable()).length(BOARD_SIZE);
export type Board = z.infer<typeof BoardSchema>;

export const BuildSchema = z.object({
  board: BoardSchema,
  patronGodId: GodIdSchema.nullable(),
});
export type Build = z.infer<typeof BuildSchema>;
