// Values that are not a card, a board or a comp in themselves but turn up across all three.
import { z } from 'zod';

export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type Slug = z.infer<typeof SlugSchema>;

export const KeywordCodeSchema = z.string().regex(/^[a-z]+(?:_[a-z]+)*$/);
export type KeywordCode = z.infer<typeof KeywordCodeSchema>;

/** The game's own version, written the one way every source writes it: `1.5.7`. */
export const GameVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type GameVersion = z.infer<typeof GameVersionSchema>;

/** How far a unit has been upgraded on the board. */
export const RankSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type Rank = z.infer<typeof RankSchema>;

/** Sanctum Tier. Every card carries one; a god always sits at 6, the top of the track. */
export const TierSchema = z.number().int().min(1).max(6);
export type Tier = z.infer<typeof TierSchema>;
