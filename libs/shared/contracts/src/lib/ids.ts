// One schema per id kind, so the patterns in `constants` are never re-typed at a use site.
import { z } from 'zod';
import { GOD_ID_PATTERN, SPELL_ID_PATTERN, UNIT_ID_PATTERN } from './constants';

export const UnitIdSchema = z.string().regex(UNIT_ID_PATTERN);
export type UnitId = z.infer<typeof UnitIdSchema>;

export const GodIdSchema = z.string().regex(GOD_ID_PATTERN);
export type GodId = z.infer<typeof GodIdSchema>;

export const SpellIdSchema = z.string().regex(SPELL_ID_PATTERN);
export type SpellId = z.infer<typeof SpellIdSchema>;

export const CardIdSchema = z.union([UnitIdSchema, GodIdSchema, SpellIdSchema]);
export type CardId = z.infer<typeof CardIdSchema>;
