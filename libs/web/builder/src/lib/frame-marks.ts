import type { KeywordCode } from '@mythictatics/shared/contracts';

/**
 * The keywords the game draws into a unit's frame rather than as a mark beside it.
 *
 * The client ships art for each of these that the rail of small description icons has no use for:
 * a weapon leaning on the frame's left bar for the three attack shapes, and a golden aura over the
 * frame for Safeguard. `CardTile` keeps them out of the rail so a card never says the same thing
 * twice — the weapon and the small `icon_cleave` are the same keyword.
 *
 * Everything else a card carries stays in the rail: the client has one picture for it, and that
 * picture is what the rules text uses inline.
 */
export const FRAME_KEYWORDS: ReadonlySet<KeywordCode> = new Set<KeywordCode>([
  'cleave',
  'pierce',
  'ranged',
  'safeguard',
]);

/**
 * The weapon a unit's attack shape hangs on the frame: an axe for Cleave, a spear for Pierce, a
 * quiver for Ranged.
 *
 * These are the client's own `icon_unit-frame_*` sprites — named for the frame, not for the rules
 * text, which is the client saying they belong on the card rather than in a tooltip. Each is tall
 * and narrow, so it is sized by height and keeps its own width; `width`/`height` are the sprite's,
 * kept here so the img can reserve the right box before the picture arrives.
 *
 * The order is the order they hang in, not the order the dataset lists them: a card with two of
 * these always hangs them the same way round.
 */
export const WEAPON_MARKS: readonly WeaponMark[] = [
  { code: 'ranged', image: '/images/frames/icon_unit-frame_ranged.png', width: 140, height: 392 },
  { code: 'cleave', image: '/images/frames/icon_unit-frame_cleave.png', width: 128, height: 320 },
  { code: 'pierce', image: '/images/frames/icon_unit-frame_pierce.png', width: 88, height: 340 },
];

export interface WeaponMark {
  code: KeywordCode;
  image: string;
  width: number;
  height: number;
}

/**
 * The shield the game frames a taunting unit in, in the metal of its Rank.
 *
 * The client ships four of these against the arch's four — `unit-frame-taunt_03` is the same gold
 * as `unit-frame_03` — which is what makes Taunt's mark a frame rather than the flat `icon_taunt`
 * the rules text uses inline. It is the one keyword whose mark changes with the card: a Rank 3
 * unit taunts behind gold, and a god behind the iridescent shield it Descends in.
 *
 * Taller than it is wide, unlike every description icon, so the rail sizes marks by height.
 */
export const TAUNT_MARKS: readonly FrameArt[] = [
  { image: '/images/frames/unit-frame-taunt_01.png', width: 216, height: 272 },
  { image: '/images/frames/unit-frame-taunt_02.png', width: 216, height: 272 },
  { image: '/images/frames/unit-frame-taunt_03.png', width: 216, height: 272 },
];

/** A patron god taunts behind the iridescent shield, as it stands in the iridescent arch. */
export const TAUNT_GOD_MARK: FrameArt = {
  image: '/images/frames/unit-frame-taunt_04.png',
  width: 216,
  height: 272,
};

/** A picture the frame lends a keyword, in place of the flat icon the rules text uses. */
export interface FrameArt {
  image: string;
  width: number;
  height: number;
}
