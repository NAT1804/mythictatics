import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import type { Rank, Unit } from '@mythictatics/shared/contracts';
import { GameCard } from './game-card';
import { RANK_TONE } from './rank-frame';

/** How far a drag has to travel before it counts as a swipe rather than a press. */
const SWIPE = 36;

/**
 * How far a drag is allowed to travel at all.
 *
 * Deliberately barely past `SWIPE`: beyond about this much travel the front card slides under the
 * edge of the dialog and is cut off by it, so the hand stops where it stops being drawable. It
 * still reads as a swipe — this is a sixth of the card's width, which is what a carousel asks for
 * anyway.
 */
const REACH = 46;

/**
 * The fan: how far apart the cards sit and how far each leans, for the card one place back.
 *
 * The card two places back is not twice that (`FAR`) — it tucks in just behind its neighbour, the
 * way the far card of a held hand does. Straight multiples look right on paper and in practice
 * throw the third card so wide that the padding reserved for the fan has to double; a lean is a
 * rotation about the card's own body, so every extra degree costs far more width than it looks.
 */
const SPREAD = 15;
const LEAN = 4.5;
const FAR = 2;

/**
 * A unit's three Ranks, held like three playing cards and swiped through.
 *
 * A unit is one card that grows, not three cards, and this is what says so: the Ranks are fanned
 * one behind the other in a single hand, and moving between them is a swipe across that hand —
 * right to left for the next Rank, left to right to come back. The alternative, three tabs above
 * one card, states the same fact as a filing system and loses that they are the same creature.
 *
 * The Rank being read is the metal of the card's own frame (`rank-frame.ts`), so a Rank 2 is
 * recognisable with the pips out of sight — at the size the fan leaves for the cards behind, the
 * frame is most of what is visible of them anyway.
 *
 * The swipe is pointer events rather than a scroll container: a scroller would take the vertical
 * drag too, and the dialog around this needs that to scroll on a phone. `touch-action: pan-y`
 * draws that line — this component gets the horizontal, the page keeps the vertical. The pips
 * under the fan are the keyboard and screen-reader path to the same thing, and the arrow keys
 * work on the fan itself.
 */
@Component({
  selector: 'mt-rank-deck',
  imports: [GameCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let ranks = unit().ranks;

    <!-- The padding is the room the fan needs. A leaned card reaches well past the front card's
         edge, and nothing here may grow the box that holds it, so the cards are inset instead and
         the cards behind lean into the inset rather than out of the dialog. -->
    <div
      class="relative grid touch-pan-y select-none px-12 outline-none"
      role="group"
      tabindex="0"
      [attr.aria-label]="unit().name + ' — Rank ' + (rank() + 1) + ' of ' + ranks.length"
      data-testid="rank-deck"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up()"
      (pointercancel)="up()"
      (keydown.arrowleft)="key($event, 1)"
      (keydown.arrowright)="key($event, -1)"
    >
      @for (entry of ranks; track entry.rank; let index = $index) {
        <!-- Every card shares one grid cell, so the fan is as tall as its tallest card and needs
             no measured height. The cell itself is what the cards are laid over. -->
        <div
          class="[grid-area:1/1] origin-[50%_65%] will-change-transform"
          [class]="
            dragging() ? '' : 'transition-transform duration-300 motion-reduce:transition-none'
          "
          [style.transform]="transform(index)"
          [style.opacity]="index === rank() ? 1 : 0.55"
          [style.zIndex]="depth(index)"
          [attr.aria-hidden]="index === rank() ? null : 'true'"
          [attr.inert]="index === rank() ? null : ''"
        >
          <mt-game-card [card]="unit()" [rank]="entry.rank" />
        </div>
      }
    </div>

    @if (ranks.length > 1) {
      <div class="mt-3 flex items-center justify-center gap-2">
        @for (entry of ranks; track entry.rank; let index = $index) {
          <button
            type="button"
            class="h-2.5 rounded-full border transition-all"
            [class]="index === rank() ? 'w-7 border-transparent' : 'w-2.5 border-line bg-line'"
            [style.background]="index === rank() ? tone(index) : null"
            [attr.aria-label]="'Rank ' + (index + 1)"
            [attr.aria-current]="index === rank() ? 'true' : null"
            (click)="go(index)"
          ></button>
        }
      </div>

      <p class="mt-1.5 text-center text-[11px] text-ink-faint">
        Rank {{ rank() + 1 }} — swipe the cards to change
      </p>
    }
  `,
})
export class RankDeck {
  readonly unit = input.required<Unit>();
  /** Which Rank is at the front of the hand. Two-way, so the preview stays the one source. */
  readonly rank = model<Rank>(0);

  protected readonly dragging = signal(false);
  private readonly offset = signal(0);
  private origin = 0;
  private pointer: number | null = null;

  private readonly last = computed(() => this.unit().ranks.length - 1);

  /** The front card sits above the hand, and each card behind it one layer further back. */
  protected depth(index: number): number {
    return 30 - Math.abs(index - this.rank());
  }

  protected tone(index: number): string {
    return RANK_TONE[Math.min(index, RANK_TONE.length - 1)];
  }

  /**
   * Where one card of the fan sits: leaned and spread by its distance from the front, then
   * carried by whatever the drag is doing. The card in front carries the full drag and the ones
   * behind a fraction of it, which is what makes the hand read as held rather than as a slide.
   */
  protected transform(index: number): string {
    const depth = index - this.rank();
    const away = Math.min(Math.abs(depth), 2);
    const place = Math.sign(depth) * (away > 1 ? FAR : away);
    const drag = this.offset() * (depth === 0 ? 1 : 0.35);
    const shift = place * SPREAD + drag;
    const lean = place * LEAN + drag * 0.04;
    return `translateX(${shift}px) rotate(${lean}deg) scale(${1 - away * 0.06})`;
  }

  protected down(event: PointerEvent): void {
    if (this.unit().ranks.length < 2 || !event.isPrimary) return;
    this.pointer = event.pointerId;
    this.origin = event.clientX;
    this.dragging.set(true);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  protected move(event: PointerEvent): void {
    if (this.pointer !== event.pointerId) return;
    const travelled = event.clientX - this.origin;
    // At either end of the hand there is no card to pull in, so the drag goes slack rather than
    // pretending there is one — the same rubber band a list gives at the top of a scroll.
    const end =
      (travelled < 0 && this.rank() === this.last()) || (travelled > 0 && this.rank() === 0);
    const reach = end ? REACH / 3 : REACH;
    this.offset.set(Math.max(-reach, Math.min(reach, end ? travelled / 3 : travelled)));
  }

  protected up(): void {
    if (this.pointer === null) return;
    const travelled = this.offset();
    this.pointer = null;
    this.dragging.set(false);
    this.offset.set(0);
    if (Math.abs(travelled) >= SWIPE) this.step(Math.sign(travelled));
  }

  /**
   * The arrow keys do what the swipe does. They are taken from the dialog rather than shared with
   * it: left and right would otherwise scroll the dialog underneath while the hand moves.
   */
  protected key(event: Event, direction: number): void {
    event.preventDefault();
    this.step(direction);
  }

  /** `direction` is the way the hand was pushed: left (-1) brings the next Rank forward. */
  protected step(direction: number): void {
    this.go(this.rank() - Math.sign(direction));
  }

  protected go(index: number): void {
    const next = Math.max(0, Math.min(this.last(), index));
    if (next !== this.rank()) this.rank.set(next as Rank);
  }
}
