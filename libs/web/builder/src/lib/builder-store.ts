import { Location } from '@angular/common';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BOARD_SIZE,
  NEUTRAL_REALM,
  type Board,
  type God,
  type Rank,
  type RealmCode,
  type Tier,
  type Unit,
} from '@mythictatics/shared/contracts';
import {
  createEmptyBoard,
  decodeDraftParams,
  decodeShareCode,
  descendPreview,
  draftRealms,
  encodeDraftParams,
  encodeShareCode,
  isUnitDraftable,
  lockedRealmOf,
  plainText,
  remainingPicks,
  toggleRealm,
  turnOrder,
  withPatron,
  type DescendPreview,
  type RealmDraft,
} from '@mythictatics/shared/domain';
import { CatalogService } from './catalog';

export interface PoolFilters {
  search: string;
  realm: RealmCode | null;
  tier: Tier | null;
}

const NO_FILTERS: PoolFilters = { search: '', realm: null, tier: null };

/**
 * Everything the builder screen knows, and the one place the URL is read and written.
 *
 * The board and the patron god go into `?d=`, which stays byte-compatible with the Codex
 * teambuilder; the realm draft and the descend slot go into parameters of this site's own. So a
 * Codex link still opens here, and a link from here still opens there with the half it understands.
 */
@Injectable()
export class BuilderStore {
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  private readonly params = toSignal(this.route.queryParams, { initialValue: {} });
  /** The URL is read once, at the first paint that has a catalog; after that it follows state. */
  private readonly restored = signal(false);

  readonly patronGodId = signal<string | null>(null);
  readonly lockEnabled = signal(true);
  readonly pickedRealms = signal<readonly RealmCode[]>([]);
  readonly board = signal<Board>(createEmptyBoard());
  readonly descendSlot = signal<number | null>(null);
  readonly filters = signal<PoolFilters>(NO_FILTERS);

  /** The most recent time the patron was *dropped* onto a slot — see `descendOnto`. */
  readonly landing = signal<{ slot: number; seq: number } | null>(null);
  private landings = 0;

  /** What a second click will act on: a unit taken from the pool, or a unit lifted off the board. */
  readonly selectedUnitId = signal<string | null>(null);
  readonly selectedSlot = signal<number | null>(null);

  readonly patron = computed<God | null>(() => {
    const id = this.patronGodId();
    return (id ? this.catalog.god(id) : null) ?? null;
  });

  readonly draft = computed<RealmDraft>(() => ({
    locked: lockedRealmOf(this.patron(), this.lockEnabled()),
    picked: this.pickedRealms(),
  }));

  readonly realms = computed(() => draftRealms(this.draft()));
  readonly picksLeft = computed(() => remainingPicks(this.draft()));
  readonly isDraftReady = computed(() => this.picksLeft() === 0);

  readonly pool = computed<readonly Unit[]>(() => {
    const draft = this.draft();
    const { search, realm, tier } = this.filters();
    const needle = search.trim().toLowerCase();
    return this.catalog.units().filter((unit) => {
      if (!isUnitDraftable(unit, draft)) return false;
      if (realm && unit.realm !== realm) return false;
      if (tier && unit.tier !== tier) return false;
      if (!needle) return true;
      return (
        unit.name.toLowerCase().includes(needle) ||
        unit.ranks.some((rank) => plainText(rank.richText).toLowerCase().includes(needle))
      );
    });
  });

  readonly turnOrder = computed(() => turnOrder(this.board()));
  readonly placedCount = computed(() => this.board().filter(Boolean).length);

  /** Units of each realm currently on the board, so dropping a realm is never a surprise. */
  readonly boardRealmCounts = computed<ReadonlyMap<RealmCode, number>>(() => {
    const counts = new Map<RealmCode, number>();
    for (const slot of this.board()) {
      const unit = slot ? this.catalog.unit(slot.unitId) : undefined;
      if (unit) counts.set(unit.realm, (counts.get(unit.realm) ?? 0) + 1);
    }
    return counts;
  });

  readonly descend = computed<DescendPreview | null>(() => {
    const index = this.descendSlot();
    const god = this.patron();
    const slot = index === null ? null : this.board()[index];
    const base = slot ? this.catalog.unit(slot.unitId) : undefined;
    return god && slot && base ? descendPreview(god, base, slot.rank) : null;
  });

  readonly shareCode = computed(() =>
    encodeShareCode({ board: this.board(), patronGodId: this.patronGodId() }),
  );

  constructor() {
    effect(() => this.restoreFromUrl());
    effect(() => this.publishToUrl());
  }

  // --- patron and realms ---------------------------------------------------------------------

  setPatron(godId: string | null): void {
    if (godId === untracked(this.patronGodId)) return;
    this.patronGodId.set(godId);
    // The slot belonged to the god that just left it. Any brings nothing down, and a new patron
    // is a new decision about where it stands.
    this.descendSlot.set(null);
    this.rebaseDraft();
  }

  toggleLock(): void {
    this.lockEnabled.update((on) => !on);
    this.rebaseDraft();
  }

  toggleRealm(realm: RealmCode): void {
    this.pickedRealms.set(toggleRealm(untracked(this.draft), realm).picked);
    this.pruneBoard();
  }

  unitsOnBoardFrom(realm: RealmCode): number {
    return this.boardRealmCounts().get(realm) ?? 0;
  }

  // --- board ---------------------------------------------------------------------------------

  place(unitId: string, slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= BOARD_SIZE) return;
    const unit = this.catalog.unit(unitId);
    if (!unit || !isUnitDraftable(unit, untracked(this.draft))) return;
    this.board.update((board) => {
      const next = [...board];
      next[slotIndex] = { unitId, rank: next[slotIndex]?.rank ?? 0 };
      return next;
    });
    this.clearSelection();
  }

  /** Drops a unit into the first free slot, in attack order. Does nothing on a full board. */
  placeFirstEmpty(unitId: string): void {
    const free = untracked(this.board).findIndex((slot) => slot === null);
    if (free >= 0) this.place(unitId, free);
  }

  /** Moves a unit between slots, swapping with whatever was already there. */
  move(from: number, to: number): void {
    if (from === to) return this.clearSelection();
    this.board.update((board) => {
      const next = [...board];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    // The god travels with the unit it came down on, so rearranging never strands it.
    this.descendSlot.update((slot) => (slot === from ? to : slot === to ? from : slot));
    this.clearSelection();
  }

  remove(slotIndex: number): void {
    this.board.update((board) => {
      const next = [...board];
      next[slotIndex] = null;
      return next;
    });
    // The god stays on the slot it was put on. Taking the unit out from under it leaves a god
    // holding an empty place, which is a state the board can show — and losing the patron off
    // the board because a unit was swapped out would be its own surprise.
    this.clearSelection();
  }

  /** Steps a unit through the Ranks it actually has, wrapping back to Rank 1. */
  cycleRank(slotIndex: number): void {
    const slot = untracked(this.board)[slotIndex];
    const unit = slot ? this.catalog.unit(slot.unitId) : undefined;
    if (!slot || !unit) return;
    const rank = ((slot.rank + 1) % unit.ranks.length) as Rank;
    this.board.update((board) => {
      const next = [...board];
      next[slotIndex] = { ...slot, rank };
      return next;
    });
  }

  clearBoard(): void {
    this.board.set(createEmptyBoard());
    this.descendSlot.set(null);
    this.clearSelection();
  }

  // --- descend -------------------------------------------------------------------------------

  /** Lands the patron on a slot, or takes it back off the slot it is already on. */
  toggleDescend(slotIndex: number): void {
    if (!untracked(this.patron) || !untracked(this.board)[slotIndex]) return;
    this.descendSlot.update((slot) => (slot === slotIndex ? null : slotIndex));
  }

  /**
   * Puts the patron on a slot, whether or not a unit is already standing there.
   *
   * Separate from `toggleDescend` because a drag says where the god is going, not that it should
   * change its mind: dropping it on the slot it is already on has to leave it there, or the drop
   * would read as having missed.
   *
   * An empty slot is allowed. The god is then just on the board, holding a place — which is how
   * a board gets laid out in practice, the god put down first and the ally it will come down on
   * chosen after. `descend` stays null until there is a unit under it, so nothing claims a sum
   * that has not happened.
   */
  descendOnto(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= BOARD_SIZE || !untracked(this.patron)) return;
    this.descendSlot.set(slotIndex);
    // Announce the arrival separately from the position. A god that is simply *on* slot 3 —
    // restored from a link, say — has not just landed there, and should not be thrown down the
    // screen every time the page opens. `seq` keeps two landings on the same slot distinct.
    this.landing.set({ slot: slotIndex, seq: ++this.landings });
  }

  /** Takes the patron back off the board, wherever it came down. */
  recallDescend(): void {
    this.descendSlot.set(null);
  }

  // --- selection: the tap and keyboard path onto the board -----------------------------------

  selectUnit(unitId: string | null): void {
    this.selectedUnitId.set(unitId);
    this.selectedSlot.set(null);
  }

  selectSlot(slotIndex: number | null): void {
    this.selectedSlot.set(slotIndex);
    this.selectedUnitId.set(null);
  }

  /** A click on a slot: place what is held, move what was lifted, else lift this slot. */
  activateSlot(slotIndex: number): void {
    const unitId = untracked(this.selectedUnitId);
    if (unitId) return this.place(unitId, slotIndex);
    const from = untracked(this.selectedSlot);
    if (from !== null) return this.move(from, slotIndex);
    if (untracked(this.board)[slotIndex]) this.selectSlot(slotIndex);
  }

  clearSelection(): void {
    this.selectedUnitId.set(null);
    this.selectedSlot.set(null);
  }

  setFilters(patch: Partial<PoolFilters>): void {
    this.filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters(): void {
    this.filters.set(NO_FILTERS);
  }

  // --- keeping the state consistent ----------------------------------------------------------

  /** Re-derives the draft after a change of patron or lock, then drops what it orphaned. */
  private rebaseDraft(): void {
    const next = withPatron(
      untracked(this.draft),
      untracked(this.patron),
      untracked(this.lockEnabled),
    );
    this.pickedRealms.set(next.picked);
    this.pruneBoard();
  }

  /**
   * Takes off the board any unit whose realm just left the draft.
   *
   * The alternative — refusing the change — hides the cost behind a disabled control. The realm
   * chips carry the count of units each realm has on the board, so this is never a surprise.
   */
  private pruneBoard(): void {
    const draft = untracked(this.draft);
    this.board.update((board) =>
      board.map((slot) => {
        const unit = slot ? this.catalog.unit(slot.unitId) : undefined;
        // A unit the catalog does not know came out of a share code, not out of the draft, so it
        // is left where it is rather than silently dropped here.
        return !slot || !unit || isUnitDraftable(unit, draft) ? slot : null;
      }),
    );
    // The god is not pruned with the unit it was standing on: a slot with a god and no unit is
    // a state the board draws, so it stays put and can be given a new ally.
  }

  // --- the URL -------------------------------------------------------------------------------

  private restoreFromUrl(): void {
    const params = this.params() as Record<string, string | undefined>;
    // Waiting for the catalog is what lets a share code drop units and gods a patch removed.
    if (untracked(this.restored) || !this.catalog.value()) return;

    const token = params['d'];
    if (token) {
      const result = decodeShareCode(token, {
        isKnownUnit: (id) => !!this.catalog.unit(id),
        isKnownGod: (id) => !!this.catalog.god(id),
      });
      if (result.ok) {
        this.board.set(result.build.board);
        this.patronGodId.set(result.build.patronGodId);
      }
    }

    const draft = decodeDraftParams(params);
    this.lockEnabled.set(draft.lockEnabled);
    this.pickedRealms.set(draft.realms);
    // A Codex link carries a board but no realms. The board is the stronger evidence of what was
    // drafted, so realms it implies are added back before anything gets pruned for being undrafted.
    for (const realm of untracked(this.boardRealmCounts).keys()) {
      if (realm === NEUTRAL_REALM || untracked(this.realms).includes(realm)) continue;
      this.pickedRealms.update((picked) => [...picked, realm]);
    }
    // Only the patron has to be real for the slot to mean anything; the slot itself may be empty,
    // which is a god put down before its ally was chosen.
    const slot = draft.descendSlot;
    const inRange = slot !== null && slot >= 0 && slot < BOARD_SIZE;
    this.descendSlot.set(inRange && untracked(this.patronGodId) ? slot : null);

    this.restored.set(true);
  }

  private publishToUrl(): void {
    const queryParams = {
      d: this.placedCount() || this.patronGodId() ? this.shareCode() : null,
      ...encodeDraftParams({
        realms: this.pickedRealms(),
        lockEnabled: this.lockEnabled(),
        descendSlot: this.descendSlot(),
      }),
    };
    // Nothing is written before the URL has been read, or the first write would erase it.
    if (!this.restored()) return;

    // Rewritten, not navigated to. Placing a unit is not a change of page, and routing it as one
    // made the router scroll the window to the top on every single edit: the app asks for
    // `scrollPositionRestoration: 'enabled'`, which scrolls to 0,0 for any navigation the browser
    // did not itself pop, and `replaceUrl` does not exempt it. That was invisible while the
    // builder was pinned to the viewport with nowhere to scroll, and unmissable the moment the
    // page was allowed to grow.
    //
    // `Location.replaceState` puts the same URL in the address bar and in the history entry —
    // which is all this needs, the link being the point — and fires no navigation at all. The
    // router's own state is left behind, which costs nothing here: the URL is read once on the
    // way in, every parameter this owns is written on every pass, and the shell's links are
    // absolute.
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}
