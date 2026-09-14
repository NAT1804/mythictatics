import { z } from 'zod';
import { GOD_ID_PATTERN, SPELL_ID_PATTERN, UNIT_ID_PATTERN } from './constants';
import { DataConfidenceSchema, RealmCodeSchema } from './realm';

export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const KeywordCodeSchema = z.string().regex(/^[a-z]+(?:_[a-z]+)*$/);
export const GameVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const RankSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type Rank = z.infer<typeof RankSchema>;

/**
 * Card text parsed from the game's rich-text markup
 * (`<color=#...>` highlights and `<sprite name=...>` icons), so no raw HTML is ever rendered.
 */
export const RichTextTokenSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({ type: z.literal('highlight'), value: z.string() }),
  z.object({ type: z.literal('icon'), name: z.string() }),
]);
export type RichTextToken = z.infer<typeof RichTextTokenSchema>;

export const KeywordSchema = z.object({
  code: KeywordCodeSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
});
export type Keyword = z.infer<typeof KeywordSchema>;

export const UnitRankSchema = z.object({
  rank: RankSchema,
  attack: z.number().int().nonnegative(),
  health: z.number().int().nonnegative(),
  text: z.string(),
  richText: z.array(RichTextTokenSchema),
});
export type UnitRank = z.infer<typeof UnitRankSchema>;

const cardBase = {
  slug: SlugSchema,
  name: z.string().min(1),
  image: z.string().nullable(),
};

export const UnitSchema = z.object({
  ...cardBase,
  id: z.string().regex(UNIT_ID_PATTERN),
  type: z.literal('unit'),
  realm: RealmCodeSchema,
  realmConfidence: DataConfidenceSchema,
  tier: z.number().int().min(1).max(6),
  cost: z.number().int().nonnegative().nullable(),
  keywords: z.array(KeywordCodeSchema),
  ranks: z.array(UnitRankSchema).min(1).max(3),
});
export type Unit = z.infer<typeof UnitSchema>;

export const GodSchema = z.object({
  ...cardBase,
  id: z.string().regex(GOD_ID_PATTERN),
  type: z.literal('god'),
  realm: RealmCodeSchema.nullable(),
  realmConfidence: DataConfidenceSchema.nullable(),
  powerName: z.string().nullable(),
  powerText: z.array(RichTextTokenSchema),
  passiveText: z.array(RichTextTokenSchema),
});
export type God = z.infer<typeof GodSchema>;

export const SpellSchema = z.object({
  ...cardBase,
  id: z.string().regex(SPELL_ID_PATTERN),
  type: z.literal('spell'),
  subtype: z.enum(['sanctum', 'medicine']),
  tier: z.number().int().min(1).max(6),
  cost: z.number().int().nonnegative().nullable(),
  keywords: z.array(KeywordCodeSchema),
  text: z.array(RichTextTokenSchema),
});
export type Spell = z.infer<typeof SpellSchema>;

export const CardSchema = z.discriminatedUnion('type', [UnitSchema, GodSchema, SpellSchema]);
export type Card = z.infer<typeof CardSchema>;
