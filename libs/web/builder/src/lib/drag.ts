import { DOCUMENT } from '@angular/common';
import { Directive, Injectable, computed, inject, input, signal } from '@angular/core';

/**
 * Dragging, on Pointer Events rather than HTML5 drag-and-drop or a CDK.
 *
 * HTML5 drag-and-drop does not fire on touch at all, which rules it out for a board people will
 * lay out on a phone; Pointer Events cover mouse, pen and touch in one path. The board is six
 * slots, so the whole thing is a pointerdown, a hit test against `[data-drop-slot]`, and a
 * pointerup — a drag library would be more code than this, not less.
 *
 * A drag is only *armed* on pointerdown. It becomes a real drag once the pointer has travelled
 * past `DRAG_THRESHOLD`, which is what leaves a plain click free to mean "select" — the tap path
 * onto the board, and the one that works with a keyboard.
 */
export type DragPayload =
  { kind: 'unit'; unitId: string } | { kind: 'slot'; index: number; unitId: string };

export type DropHandler = (payload: DragPayload, slotIndex: number | null) => void;

/** Far enough that a shaky click is still a click, short enough that a drag feels immediate. */
const DRAG_THRESHOLD = 5;

export const DROP_SLOT_ATTRIBUTE = 'data-drop-slot';

@Injectable()
export class DragService {
  private readonly document = inject(DOCUMENT);

  private readonly armed = signal<DragPayload | null>(null);
  private readonly moved = signal(false);
  private handleDrop: DropHandler = () => undefined;
  private release: (() => void) | null = null;

  /** The payload of a drag that has actually started — null while it is only armed. */
  readonly payload = computed(() => (this.moved() ? this.armed() : null));
  readonly position = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly overSlot = signal<number | null>(null);
  readonly isDragging = computed(() => this.payload() !== null);

  onDrop(handler: DropHandler): void {
    this.handleDrop = handler;
  }

  begin(payload: DragPayload, event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    this.cancel();
    this.armed.set(payload);
    this.moved.set(false);
    this.position.set({ x: event.clientX, y: event.clientY });

    const origin = { x: event.clientX, y: event.clientY };
    const onMove = (move: PointerEvent) => this.track(move, origin);
    const onUp = (up: PointerEvent) => this.finish(up);
    const onCancel = () => this.cancel();

    const target = this.document.defaultView;
    target?.addEventListener('pointermove', onMove);
    target?.addEventListener('pointerup', onUp);
    target?.addEventListener('pointercancel', onCancel);
    this.release = () => {
      target?.removeEventListener('pointermove', onMove);
      target?.removeEventListener('pointerup', onUp);
      target?.removeEventListener('pointercancel', onCancel);
    };
  }

  cancel(): void {
    this.release?.();
    this.release = null;
    this.armed.set(null);
    this.moved.set(false);
    this.overSlot.set(null);
  }

  private track(event: PointerEvent, origin: { x: number; y: number }): void {
    const travelled = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
    if (!this.moved() && travelled < DRAG_THRESHOLD) return;
    if (!this.moved()) this.moved.set(true);
    // Once dragging, the page must not scroll or select text under the ghost.
    event.preventDefault();
    this.position.set({ x: event.clientX, y: event.clientY });
    this.overSlot.set(this.slotAt(event.clientX, event.clientY));
  }

  private finish(event: PointerEvent): void {
    const payload = this.payload();
    const slot = payload ? this.slotAt(event.clientX, event.clientY) : null;
    this.cancel();
    // A drop outside every slot still reaches the handler, which is how dragging a unit off the
    // board clears its slot.
    if (payload) this.handleDrop(payload, slot);
  }

  /**
   * The slot under the pointer, found by hit test rather than by a registry of rectangles: the
   * board scrolls and resizes, and a stale rectangle is the classic source of an off-by-one drop.
   * The ghost is `pointer-events: none`, so it never hit-tests as itself.
   */
  private slotAt(x: number, y: number): number | null {
    const element = this.document.elementFromPoint(x, y) as Element | null;
    const slot = element?.closest(`[${DROP_SLOT_ATTRIBUTE}]`);
    const index = Number(slot?.getAttribute(DROP_SLOT_ATTRIBUTE));
    return slot && Number.isInteger(index) ? index : null;
  }
}

/** Marks an element as something that can be picked up and dropped onto a board slot. */
@Directive({
  selector: '[mtDragSource]',
  host: {
    '(pointerdown)': 'start($event)',
    '[class.touch-none]': 'true',
  },
})
export class DragSource {
  private readonly drag = inject(DragService);

  readonly mtDragSource = input.required<DragPayload>();

  start(event: PointerEvent): void {
    this.drag.begin(this.mtDragSource(), event);
  }
}
