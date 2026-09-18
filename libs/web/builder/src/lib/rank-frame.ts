import type { Card, Rank } from '@mythictatics/shared/contracts';

/**
 * The frame, in the game's own art, coloured by the Rank the unit is at: bronze, silver, gold.
 *
 * These are the client's own board frames — `unit-frame_01` and its siblings — the arch a unit
 * stands in with its Attack and Health discs drawn into the foot. `styles.css` says how one sprite
 * is made to fit a card of any height without distorting the dome. The site used to draw this
 * shape itself, as a gradient sampled off this same art with the arch written in CSS radii; the
 * art is the frame now, so both the sampling and the radii are gone.
 *
 * `r04`, the iridescent one, is what the game gives a Descend, and a god wears it here.
 */
export const RANK_FRAME = [
  'card-arch card-arch-r01',
  'card-arch card-arch-r02',
  'card-arch card-arch-r03',
] as const;

/** A patron god's card wears the iridescent frame, not a Rank. */
export const GOD_FRAME = 'card-arch card-arch-r04';

/**
 * A spell wears the game's own spell card frame, which is a rectangle.
 *
 * Not the arch, and deliberately: the arch has an Attack disc and a Health disc drawn into it, and
 * a spell has neither. Wearing it would put two empty sockets on every spell in the collection.
 */
export const SPELL_FRAME = 'card-frame card-frame-spell';

/** What a unit wears when it has no Rank to show — gold, as it was before Rank was drawn at all. */
export const PLAIN_FRAME = 'card-arch card-arch-r03';

/**
 * The single flat colour behind a Rank — the pip in a rank switch, a ring drawn in one tone.
 *
 * The game's own colours, sampled off the frames above, so a control tinted with this and the
 * frame it selects read as the same metal.
 */
export const RANK_TONE = ['#b07a45', '#a8aaa4', '#d4a93a'] as const;

/**
 * The other shape a card has: the rectangle the game deals it in, rather than the arch it stands
 * in on the board.
 *
 * Both are the game's own, and the site uses them the way the game does — the arch on every tile,
 * where a card is being played, and this one at reading size, where it is being read. A rectangle
 * also has room the arch does not: the rules text runs the full width of the card, and the Attack
 * and Health are discs threaded onto the frame's sides rather than sockets in a foot.
 *
 * A god's card wears the client's `champion` frame, which is the iridescent one it is dealt in.
 */
export const CARD_FRAME = [
  'card-rect card-rect-r01',
  'card-rect card-rect-r02',
  'card-rect card-rect-r03',
] as const;
export const CARD_GOD_FRAME = 'card-rect card-rect-champion';
export const CARD_SPELL_FRAME = 'card-rect card-rect-spell';

/** The ring a stat disc wears, in the metal of the frame it is threaded onto. */
export const CARD_RING = [
  'card-rect-ring card-rect-ring-r01',
  'card-rect-ring card-rect-ring-r02',
  'card-rect-ring card-rect-ring-r03',
] as const;
export const CARD_GOD_RING = 'card-rect-ring card-rect-ring-r04';

/** The frame a card wears at a given Rank: gods iridescent, spells their own, units by Rank. */
export function frameOf(card: Card, rank: Rank): string {
  if (card.type === 'god') return CARD_GOD_FRAME;
  if (card.type === 'spell') return CARD_SPELL_FRAME;
  return CARD_FRAME[Math.min(rank, CARD_FRAME.length - 1)];
}

/** The ring a card's stat discs wear, matched to `frameOf`. */
export function ringOf(card: Card, rank: Rank): string {
  if (card.type === 'god') return CARD_GOD_RING;
  return CARD_RING[Math.min(rank, CARD_RING.length - 1)];
}
