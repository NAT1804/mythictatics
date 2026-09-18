import { z } from 'zod';
import { SPELL_SUBTYPES } from './constants';
import { GodIdSchema, SpellIdSchema, UnitIdSchema } from './ids';
import { KeywordCodeSchema, RankSchema, SlugSchema, TierSchema } from './primitives';
import { RealmCodeSchema } from './realm';

/**
 * Card text parsed from the game's rich-text markup
 * (`<color=#...>` highlights and `<sprite name=...>` icons), so no raw HTML is ever rendered.
 *
 * Tokens are the only form a card's text takes. Where a plain string is wanted — a title, a
 * search index, alt text — derive it with `plainText` from `@mythictatics/shared/domain` rather
 * than carrying a second copy of every line around.
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
  /**
   * The sprite the game shows beside the term, or null for a keyword it writes as words alone.
   *
   * It is the icon's name in the game's atlas, not a path: resolve it through `icons.json` the
   * same way an inline `icon` token in card text is resolved. Not every keyword has one — the
   * purely structural ones (`aura`, `descend`, the `event_*` rows) carry no art in the client.
   */
  icon: z.string().min(1).nullable(),
});
export type Keyword = z.infer<typeof KeywordSchema>;

export const UnitRankSchema = z.object({
  rank: RankSchema,
  attack: z.number().int().nonnegative(),
  health: z.number().int().nonnegative(),
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
  id: UnitIdSchema,
  type: z.literal('unit'),
  realm: RealmCodeSchema,
  tier: TierSchema,
  cost: z.number().int().nonnegative(),
  keywords: z.array(KeywordCodeSchema),
  ranks: z.array(UnitRankSchema).min(1).max(3),
});
export type Unit = z.infer<typeof UnitSchema>;

export const GodSchema = z.object({
  ...cardBase,
  id: GodIdSchema,
  type: z.literal('god'),
  realm: RealmCodeSchema,
  /** Whether this god's realm is forced into the draft, leaving the player two picks instead of three. */
  realmLock: z.boolean(),
  /** Always 6 — a god sits at the top Sanctum Tier — but typed like any other card's. */
  tier: TierSchema,
  /** A god's own body, used once it Descends. Not on the same scale as a unit's. */
  attack: z.number().int().nonnegative(),
  health: z.number().int().nonnegative(),
  /** A god's power and passive carry keywords the same way a unit's text does. */
  keywords: z.array(KeywordCodeSchema),
  powerName: z.string().nullable(),
  powerText: z.array(RichTextTokenSchema),
  /**
   * The Power's own icon. Not nullable, unlike a card's `image`: the client ships one per god, so
   * the dataset requires it and this can be rendered without a guard.
   */
  powerImage: z.string().min(1),
  /** The god's full-height standee, for showing a chosen patron at more than tile size. */
  bannerImage: z.string().min(1),
  /** What the god turns into on Descend. */
  descendText: z.array(RichTextTokenSchema),
  /** What the player has to do to unlock the Descend. */
  descendQuestText: z.array(RichTextTokenSchema),
});
export type God = z.infer<typeof GodSchema>;

export const SpellSchema = z.object({
  ...cardBase,
  id: SpellIdSchema,
  type: z.literal('spell'),
  subtype: z.enum(SPELL_SUBTYPES),
  /**
   * Set for the thirteen spells that belong to one realm — every Shenzhou Medicine, plus Niles'
   * Promotion Reward. Null for the fifty Sanctum spells any realm can be offered.
   */
  realm: RealmCodeSchema.nullable(),
  tier: TierSchema,
  /** Medicine is granted by Alchemy rather than bought, and six Sanctum spells are free too. */
  cost: z.number().int().nonnegative().nullable(),
  keywords: z.array(KeywordCodeSchema),
  text: z.array(RichTextTokenSchema),
  /** A few spells offer a choice; each option is its own line. Empty for every other spell. */
  options: z.array(z.array(RichTextTokenSchema)),
});
export type Spell = z.infer<typeof SpellSchema>;

export const CardSchema = z.discriminatedUnion('type', [UnitSchema, GodSchema, SpellSchema]);
export type Card = z.infer<typeof CardSchema>;
