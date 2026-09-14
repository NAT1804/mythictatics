import { z } from 'zod';
import { RankSchema } from './card';
import { BOARD_SIZE, GOD_ID_PATTERN, UNIT_ID_PATTERN } from './constants';

export const BoardSlotSchema = z.object({
  unitId: z.string().regex(UNIT_ID_PATTERN),
  rank: RankSchema,
});
export type BoardSlot = z.infer<typeof BoardSlotSchema>;

export const BoardSchema = z.array(BoardSlotSchema.nullable()).length(BOARD_SIZE);
export type Board = z.infer<typeof BoardSchema>;

export const BuildSchema = z.object({
  board: BoardSchema,
  patronGodId: z.string().regex(GOD_ID_PATTERN).nullable(),
});
export type Build = z.infer<typeof BuildSchema>;
