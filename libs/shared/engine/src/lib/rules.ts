/**
 * The numbers the rules are tuned by. Changing any of them changes how a fight goes, so it moves
 * `ENGINE_VERSION` too — a replay only replays under the rules it was fought with.
 */

/** Written into every `MatchSetup`; bump on any change to how a battle resolves. */
export const ENGINE_VERSION = '0.1.0';

/** Past this many rounds the fight is a draw. */
export const MAX_ROUNDS = 30;

/**
 * A battle that has logged this many events is a runaway chain of triggers, and is called a draw
 * rather than left to run. Real fights stay far under it (the busiest comp mirror logs a few
 * thousand).
 */
export const EVENT_BUDGET = 20_000;

/** How deep "attack immediately" may nest inside another attack. */
export const MAX_ATTACK_DEPTH = 8;

/** Stats a Celestial Medicine of Tier T gives in battle, per Tier — see `Battle.castMedicine`. */
export const MEDICINE_STATS_PER_TIER = 1;
