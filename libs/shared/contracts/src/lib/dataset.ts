import { z } from 'zod';
import { GodIdSchema, SpellIdSchema, UnitIdSchema } from './ids';
import { GameVersionSchema, RankSchema, TierSchema } from './primitives';
import { RealmCodeSchema } from './realm';

/**
 * The shape of `data/canonical/`, the project's one dataset.
 *
 * It is deliberately source-shaped rather than app-shaped: text is still in the game's own
 * rich-text markup and still carries every locale the client ships, so the mapping into `Card`
 * stays a separate, testable step in `@mythictatics/shared/domain`.
 *
 * The dataset is maintained by hand now. Almost all of it was extracted from the shipped game
 * client with `tools/client/extract_cards.py`, which is still the way to refresh it after a
 * patch; `tier`, `cost`, `attack` and `health` are the exception, since the client does not
 * carry them — see `meta.json`. Validate with these schemas on the way in; once mapped, the app
 * deals in `Card`.
 */

/** Locales are whatever the client shipped, so the keys are not fixed here. */
export const LocalizedSchema = z.record(z.string(), z.string());
export type Localized = z.infer<typeof LocalizedSchema>;

/**
 * What every card carries. `realm`, `tier` and `cost` are deliberately not here: each kind
 * answers them differently, and stating that per kind is what lets the mapping into `Card` drop
 * its casts and `??` fallbacks. A patch that leaves one of them out should fail here, loudly,
 * rather than reach the site as a made-up 0.
 */
const datasetCardBase = {
  /** The sprite's name inside the game's own atlas — the identifier the client ships. */
  sprite: z.string().min(1).nullable(),
  /** What the site serves, relative to the web root: `images/units/babylon/m05001.png`. */
  image: z.string().min(1).nullable(),
  imageWidth: z.number().int().positive().nullable(),
  imageHeight: z.number().int().positive().nullable(),
  /** Of the exported PNG, so the dataset can be checked without the extraction output. */
  imageSha256: z.string().length(64).nullable(),
  keywords: z.array(z.string()),
  name: LocalizedSchema,
};

export const DatasetRankSchema = z.object({
  rank: RankSchema,
  attack: z.number().int().nonnegative(),
  health: z.number().int().nonnegative(),
  text: LocalizedSchema,
  textPlain: LocalizedSchema,
});
export type DatasetRank = z.infer<typeof DatasetRankSchema>;

export const DatasetUnitSchema = z.object({
  ...datasetCardBase,
  id: UnitIdSchema,
  kind: z.literal('unit'),
  subtype: z.null(),
  /** A unit's realm comes from the atlas its art shipped in, so it is never in doubt. */
  realm: RealmCodeSchema,
  tier: TierSchema,
  cost: z.number().int().nonnegative(),
  ranks: z.array(DatasetRankSchema).min(1).max(3),
});

export const DatasetGodSchema = z.object({
  ...datasetCardBase,
  id: GodIdSchema,
  kind: z.literal('god'),
  subtype: z.null(),
  realm: RealmCodeSchema,
  /** Gods carry no Tier in any source; the dataset sets them all to 6 — see `meta.json`. */
  tier: z.literal(6),
  /** A patron is chosen, not bought — the `godCost` convention in `meta.json`. */
  cost: z.null(),
  stats: z.object({
    attack: z.number().int().nonnegative(),
    health: z.number().int().nonnegative(),
  }),
  power: z.object({ name: LocalizedSchema, description: LocalizedSchema }),
  powerPlain: LocalizedSchema,
  /** The unit a god becomes on Descend. */
  descendUnit: LocalizedSchema,
  descendQuest: LocalizedSchema,
});

export const DatasetSpellSchema = z.object({
  ...datasetCardBase,
  id: SpellIdSchema,
  kind: z.literal('spell'),
  subtype: z.enum(['sanctum', 'medicine']),
  /** Set for a spell that belongs to one realm, null for a shared Sanctum spell. */
  realm: RealmCodeSchema.nullable(),
  tier: TierSchema,
  /** Null where the spell is not bought with gold — every Medicine, and six Sanctum spells. */
  cost: z.number().int().nonnegative().nullable(),
  description: LocalizedSchema,
  descriptionPlain: LocalizedSchema,
  /** A few spells offer a choice; each option is its own localized line. */
  options: z.array(LocalizedSchema).optional(),
});

export const DatasetCardSchema = z.discriminatedUnion('kind', [
  DatasetUnitSchema,
  DatasetGodSchema,
  DatasetSpellSchema,
]);
export type DatasetCard = z.infer<typeof DatasetCardSchema>;
export type DatasetUnit = z.infer<typeof DatasetUnitSchema>;
export type DatasetGod = z.infer<typeof DatasetGodSchema>;
export type DatasetSpell = z.infer<typeof DatasetSpellSchema>;

export const DatasetKeywordSchema = z.object({
  key: z.string().min(1),
  title: LocalizedSchema,
  description: LocalizedSchema.nullable(),
});
export type DatasetKeyword = z.infer<typeof DatasetKeywordSchema>;

export const DatasetRealmSchema = z.object({
  code: RealmCodeSchema,
  /** The realm's number in the game's own id scheme: Babylon is 5, so its units are `m05xxx`. */
  number: z.number().int().positive(),
  name: LocalizedSchema,
});
export type DatasetRealm = z.infer<typeof DatasetRealmSchema>;

const datasetIconBase = {
  sprite: z.string().min(1),
  /** What the site serves, relative to the web root. */
  image: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().length(64),
};

/**
 * Split by `kind` rather than carrying optional-and-nullable `tier`/`variant` on every icon:
 * only Tier art has them, and a union says so instead of leaving three ways to mean "no tier".
 */
export const DatasetIconSchema = z.discriminatedUnion('kind', [
  z.object({ ...datasetIconBase, kind: z.literal('description') }),
  z.object({ ...datasetIconBase, kind: z.literal('rank') }),
  z.object({
    ...datasetIconBase,
    kind: z.literal('tier'),
    /** Which Tier the art draws, and which arrangement of stars. Null on the generic star. */
    tier: TierSchema.nullable(),
    variant: z.number().int().positive().nullable(),
  }),
]);
export type DatasetIcon = z.infer<typeof DatasetIconSchema>;

export const DatasetMetaSchema = z.object({
  gameVersion: GameVersionSchema,
  locales: z.array(z.string()).min(1),
  counts: z.object({
    cards: z.number().int().positive(),
    byKind: z.record(z.enum(['unit', 'god', 'spell']), z.number().int().nonnegative()),
    keywords: z.number().int().nonnegative(),
    realms: z.number().int().nonnegative(),
    icons: z.number().int().nonnegative(),
  }),
  coverage: z.object({
    tier: z.number().int().nonnegative(),
    cost: z.number().int().nonnegative(),
    stats: z.number().int().nonnegative(),
  }),
  /** Cards that have a name in each locale; the newest cards trail in the smaller languages. */
  localeCoverage: z.record(z.string(), z.number().int().nonnegative()),
  /**
   * Cards the client's tables define that the game does not actually offer. Extracting a build
   * produces them again, so each one is listed with why it was dropped.
   */
  excluded: z
    .array(z.object({ id: z.string(), name: z.string(), reason: z.string().min(1) }))
    .optional(),
  /** Deliberate choices about the data's shape, for anyone tempted to "fix" one of them. */
  conventions: z.record(z.string(), z.string()).optional(),
  source: z.object({
    gameVersion: GameVersionSchema,
    build: z.string(),
    buildSha256: z.string().length(64),
    /** Which fields came from the client and which did not; read it before trusting a number. */
    note: z.string().min(1),
  }),
  builtAt: z.iso.datetime(),
});
export type DatasetMeta = z.infer<typeof DatasetMetaSchema>;
