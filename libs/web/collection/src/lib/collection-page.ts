import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type RealmCode, type SpellSubtype, type Tier } from '@mythictatics/shared/contracts';
import {
  COLLECTION_ALL,
  COLLECTION_TABS,
  REALMS_IN_GAME_ORDER,
  collectionCards,
  toCollectionRealm,
  toCollectionSpellKind,
  toCollectionTab,
  type CollectionTab,
} from '@mythictatics/shared/domain';
import {
  CardPreview,
  CardPreviewDialog,
  CardTile,
  CatalogService,
  RealmIcon,
} from '@mythictatics/web/builder';

const TIERS: readonly Tier[] = [1, 2, 3, 4, 5, 6];

const TAB_LABEL: Record<CollectionTab, string> = {
  gods: 'Patron God',
  units: 'Units',
  spells: 'Spells',
};

/** The Spells tab's own chip row: the game offers spells as Sanctum or Medicine, nothing else. */
const SPELL_KINDS: readonly { label: string; value: SpellSubtype | null }[] = [
  { label: 'All', value: null },
  { label: 'Sanctum', value: 'sanctum' },
  { label: 'Medicine', value: 'medicine' },
];

/**
 * Every card in the game, browsed one realm at a time, with Patron God / Units / Spells along the
 * bottom the way the game's own Collection screen has them.
 *
 * Filtering is the panel Team Comps uses — always open, search and the narrowing buttons on one
 * row, the realm chips on the next — so the site's two browsing screens are filtered alike. The
 * scope still lives in the query string (`?realm=kami&tab=gods`), which is why the chips are
 * links: a realm can be linked to — the home page's realm ring does exactly that — and the back
 * button walks back through what was browsed. The search and the Tier filter are local to the
 * visit, and not worth a URL.
 *
 * What the chips offer depends on the tab. Patron God and Units are browsed by realm, plus All.
 * Spells are browsed by kind — All, Sanctum, Medicine — because a spell's realm says almost
 * nothing: fifty of the sixty-three belong to none, and all but one of the rest are the Shenzhou
 * Medicines that the Medicine chip already gathers.
 */
@Component({
  selector: 'mt-collection-page',
  imports: [CardPreviewDialog, CardTile, RealmIcon, RouterLink],
  providers: [CardPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl font-bold text-gold">Collection</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-dim">
          Every card the game can offer you. Browse patron gods and units by realm, spells by kind,
          and open any card to read its rules text in full.
        </p>
      </div>
    </header>

    <!-- Filters -->
    <div
      class="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-panel p-3"
      data-testid="collection-filters"
    >
      <div class="flex flex-wrap items-center gap-2">
        <input
          type="search"
          class="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
          placeholder="Search name or rules text…"
          aria-label="Search the collection"
          data-testid="collection-search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <div class="flex gap-1" role="group" aria-label="Tier">
          @for (option of tiers; track option) {
            <button
              type="button"
              class="w-8 rounded-md border py-1 text-xs transition-colors"
              [class]="
                tier() === option
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-line text-ink-dim hover:text-ink'
              "
              [attr.aria-label]="'Tier ' + option"
              [attr.aria-pressed]="tier() === option"
              (click)="tier.set(tier() === option ? null : option)"
            >
              {{ option }}
            </button>
          }
        </div>
      </div>

      <div
        class="flex flex-wrap items-center gap-1.5"
        role="group"
        [attr.aria-label]="currentTab() === 'spells' ? 'Kind of spell' : 'Realm'"
      >
        @if (currentTab() === 'spells') {
          @for (kind of spellKinds; track kind.label) {
            <a
              routerLink="."
              [queryParams]="{ spell: kind.value ?? all }"
              queryParamsHandling="merge"
              class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
              [class]="chipClass(currentSpellKind() === kind.value)"
              [attr.aria-current]="currentSpellKind() === kind.value ? 'true' : null"
              [attr.data-spell]="kind.value ?? all"
              >{{ kind.label }}</a
            >
          }
        } @else {
          <a
            routerLink="."
            [queryParams]="{ realm: all }"
            queryParamsHandling="merge"
            class="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            [class]="chipClass(currentRealm() === null)"
            [attr.aria-current]="currentRealm() === null ? 'true' : null"
            [attr.data-realm]="all"
            >All</a
          >
          @for (code of realms; track code) {
            <a
              routerLink="."
              [queryParams]="{ realm: code }"
              queryParamsHandling="merge"
              class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors"
              [class]="chipClass(currentRealm() === code)"
              [attr.aria-current]="currentRealm() === code ? 'true' : null"
              [attr.data-realm]="code"
            >
              <mt-realm-icon [realm]="code" class="h-3.5 w-3.5" />
              {{ realmName(code) }}
            </a>
          }
        }
        @if (filtered()) {
          <button
            type="button"
            class="ml-auto text-xs text-ink-faint hover:text-ink"
            (click)="clearFilters()"
          >
            Clear filters
          </button>
        }
      </div>
    </div>

    @if (catalog.error()) {
      <div class="py-16 text-center">
        <p class="text-sm text-red-300">The collection could not be loaded.</p>
        <button
          type="button"
          class="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-gold hover:text-gold"
          (click)="catalog.reload()"
        >
          Try again
        </button>
      </div>
    } @else if (!catalog.value()) {
      <p class="py-16 text-center text-sm text-ink-faint">Loading the collection…</p>
    } @else {
      <p class="mt-4 text-xs text-ink-faint" data-testid="collection-count">
        <span class="text-ink-dim" data-testid="scope-name">{{ scopeLabel() }}</span>
        — {{ countLabel() }}
      </p>

      @if (currentTab() === 'spells' && currentSpellKind() !== 'medicine') {
        <p class="mt-2 text-xs text-ink-faint">
          Sanctum spells belong to no realm — any draft can be offered them.
        </p>
      }

      <ul
        class="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
        data-testid="collection-grid"
      >
        @for (card of cards(); track card.id) {
          <li>
            <button
              type="button"
              class="group block w-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              [attr.aria-label]="card.name + ', Tier ' + card.tier"
              [attr.data-card]="card.id"
              data-testid="collection-card"
              (click)="preview.open(card)"
            >
              <mt-card-tile [card]="card" />
            </button>
          </li>
        } @empty {
          <li class="col-span-full py-16 text-center text-sm text-ink-faint">
            {{ emptyMessage() }}
          </li>
        }
      </ul>
    }

    <!-- The game's bottom bar. -->
    <nav class="sticky bottom-3 z-20 mt-10 flex justify-center" aria-label="Card type">
      <div
        class="flex rounded-lg border-2 border-gold/70 bg-gradient-to-b from-[#3d2f1c] to-[#241c12] p-1 shadow-xl shadow-black/60"
      >
        @for (option of tabs; track option) {
          <a
            routerLink="."
            [queryParams]="{ tab: option }"
            queryParamsHandling="merge"
            class="px-4 py-2 font-display text-sm font-semibold transition-colors sm:px-7"
            [class]="
              option === currentTab()
                ? 'bg-gradient-to-b from-gold-bright to-gold text-bg [clip-path:polygon(10%_0,90%_0,100%_50%,90%_100%,10%_100%,0_50%)]'
                : 'text-ink-dim hover:text-gold-bright'
            "
            [attr.aria-current]="option === currentTab() ? 'page' : null"
            [attr.data-testid]="'tab-' + option"
            >{{ tabLabel[option] }}</a
          >
        }
      </div>
    </nav>

    <mt-card-preview />
  `,
})
export class CollectionPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly preview = inject(CardPreview);

  /** Bound from `?realm=`; `all` is every realm, anything unrecognised the realm the game opens on. */
  readonly realm = input<string>();
  /** Bound from `?tab=`. */
  readonly tab = input<string>();
  /** Bound from `?spell=`; the Spells tab's own axis, ignored by the other two tabs. */
  readonly spell = input<string>();

  protected readonly realms = REALMS_IN_GAME_ORDER;
  protected readonly tabs = COLLECTION_TABS;
  protected readonly tabLabel = TAB_LABEL;
  protected readonly spellKinds = SPELL_KINDS;
  protected readonly tiers = TIERS;
  protected readonly all = COLLECTION_ALL;

  protected readonly currentRealm = computed(() => toCollectionRealm(this.realm()));
  protected readonly currentTab = computed(() => toCollectionTab(this.tab()));
  protected readonly currentSpellKind = computed(() => toCollectionSpellKind(this.spell()));

  protected readonly query = signal('');
  protected readonly tier = signal<Tier | null>(null);

  protected readonly filtered = computed(() => !!this.query().trim() || this.tier() !== null);

  private readonly realmNames = computed(
    () => new Map(this.catalog.realms().map((realm) => [realm.code, realm.name])),
  );

  protected readonly cards = computed(() =>
    collectionCards(
      {
        units: this.catalog.units(),
        gods: this.catalog.gods(),
        spells: this.catalog.spells(),
      },
      {
        tab: this.currentTab(),
        realm: this.currentRealm(),
        spellKind: this.currentSpellKind(),
      },
      { query: this.query(), tier: this.tier() },
    ),
  );

  /** What the chip row is showing, named: a realm, a kind of spell, or All. */
  protected readonly scopeLabel = computed(() => {
    if (this.currentTab() === 'spells') {
      const kind = this.currentSpellKind();
      return SPELL_KINDS.find((option) => option.value === kind)?.label ?? 'All';
    }
    const realm = this.currentRealm();
    return realm ? this.realmName(realm) : 'All';
  });

  protected readonly countLabel = computed(() => {
    if (!this.catalog.value()) return '';
    const count = this.cards().length;
    const noun = { gods: 'patron god', units: 'unit', spells: 'spell' }[this.currentTab()];
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
  });

  protected readonly emptyMessage = computed(() => {
    if (this.filtered()) return 'Nothing matches these filters.';
    if (this.currentTab() === 'spells') return 'No spells of this kind.';
    const realm = this.currentRealm();
    if (!realm) return 'Nothing to show.';
    const name = this.realmName(realm);
    return this.currentTab() === 'gods' ? `${name} has no patron god.` : `${name} has no units.`;
  });

  protected chipClass(active: boolean): string {
    return active ? 'border-gold bg-gold/10 text-gold' : 'border-line text-ink-dim hover:text-ink';
  }

  protected realmName(code: RealmCode): string {
    return this.realmNames().get(code) ?? code.charAt(0).toUpperCase() + code.slice(1);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.tier.set(null);
  }
}
