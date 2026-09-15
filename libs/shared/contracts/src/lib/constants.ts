// Kept free of zod so browser bundles that only need constants and types stay small.

export const REALM_CODES = [
  'babylon',
  'daehan',
  'kami',
  'neutral',
  'niles',
  'olympus',
  'shenzhou',
  'yggdrasil',
] as const;

export const NEUTRAL_REALM = 'neutral' satisfies (typeof REALM_CODES)[number];

/**
 * Each realm's number in the game's own id scheme. It is the join between an id and a realm:
 * Babylon is 5, so its units read `m05xxx` and its spells `s_05xxx`; Neutral is 10, hence
 * `m10xxx`. Every unit and every realm spell in the dataset agrees with this, so a card's realm
 * can be read straight off its id rather than looked up.
 */
export const REALM_NUMBERS = {
  babylon: 5,
  daehan: 7,
  kami: 6,
  neutral: 10,
  niles: 1,
  olympus: 2,
  shenzhou: 4,
  yggdrasil: 3,
} as const satisfies Record<(typeof REALM_CODES)[number], number>;

export const UNIT_ID_PATTERN = /^m\d{5}$/;
export const GOD_ID_PATTERN = /^champ\d{3}$/;
/**
 * Spells come in two id widths. A shared Sanctum spell is three digits (`s_001`); a spell that
 * belongs to one realm carries that realm's number in front and runs to five (`s_04001`, a
 * Shenzhou Medicine). Thirteen of the game's 63 spells are the wide kind.
 */
export const SPELL_ID_PATTERN = /^s_(?:\d{3}|\d{5})$/;

/** The board is 3 columns x 2 rows, stored row-major: front row 0-2, back row 3-5. */
export const BOARD_COLUMNS = 3;
export const BOARD_ROWS = 2;
export const BOARD_SIZE = BOARD_COLUMNS * BOARD_ROWS;
