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

  private readonly params = toSignal(this.route.queryParams, { initialValue: {} });
  /** The URL is read once, at the first paint that has a catalog; after that it follows state. */
  private readonly restored = signal(false);

  readonly patronGodId = signal<string | null>(null);
  readonly lockEnabled = signal(true);
  readonly pickedRealms = signal<readonly RealmCode[]>([]);
  readonly board = signal<Board>(createEmptyBoard());
  readonly descendSlot = signal<number | null>(null);
  readonly filters = signal<PoolFilters>(NO_FILTERS);

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
    if (untracked(this.descendSlot) === slotIndex) this.descendSlot.set(null);
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
    const descend = untracked(this.descendSlot);
    if (descend !== null && !untracked(this.board)[descend]) this.descendSlot.set(null);
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
    const slot = draft.descendSlot;
    this.descendSlot.set(slot !== null && untracked(this.board)[slot] ? slot : null);

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
    // Nothing is written before the URL has been read, or the first navigation would erase it.
    if (!this.restored()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
