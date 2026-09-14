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

export const UNIT_ID_PATTERN = /^m\d{5}$/;
export const GOD_ID_PATTERN = /^champ\d{3}$/;
export const SPELL_ID_PATTERN = /^s_\d{3}$/;

/** The board is 3 columns x 2 rows, stored row-major: front row 0-2, back row 3-5. */
export const BOARD_COLUMNS = 3;
export const BOARD_ROWS = 2;
export const BOARD_SIZE = BOARD_COLUMNS * BOARD_ROWS;
