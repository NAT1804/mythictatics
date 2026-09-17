import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NEUTRAL_REALM, type RealmCode, type Tier } from '@mythictatics/shared/contracts';
import {
  COLLECTION_TABS,
  REALMS_IN_GAME_ORDER,
  collectionCards,
  toCollectionRealm,
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

/**
 * Every card in the game, browsed the way the game's own Collection screen browses it: one realm
 * at a time, chosen from the bar across the top, with Patron God / Units / Spells along the
 * bottom.
 *
 * The realm and the tab live in the query string (`?realm=kami&tab=gods`), so a realm can be
 * linked to — the home page's realm ring does exactly that — and the back button walks back
 * through what was browsed. The search and the Tier filter are the game's funnel button: local to
 * the visit, and not worth a URL.
 *
 * Sanctum spells belong to no realm; they are filed under Neutral, the realm every draft has.
 */
@Component({
  selector: 'mt-collection-page',
  imports: [CardPreviewDialog, CardTile, RealmIcon, RouterLink],
  providers: [CardPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:keydown.escape)': 'menuOpen.set(false)',
    '(document:click)': 'closeMenuFromOutside($event)',
  },
  template: `
    <header class="text-center">
      <div class="flex items-center justify-center gap-3">
        <span
          class="h-px w-12 bg-gradient-to-r from-transparent to-gold sm:w-24"
          aria-hidden="true"
        ></span>
        <h1 class="font-display text-3xl font-bold tracking-wide text-gold sm:text-4xl">
          Collection
        </h1>
        <span
          class="h-px w-12 bg-gradient-to-l from-transparent to-gold sm:w-24"
          aria-hidden="true"
        ></span>
      </div>
      <p class="mt-1 text-[10px] tracking-[0.5em] text-gold/70" aria-hidden="true">
        ◆ ◆ <span class="text-sm">◆</span> ◆ ◆
      </p>
    </header>

    <!-- Realm bar -->
    <div class="relative mt-5" data-realm-menu>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-md border-2 border-gold/70 bg-gradient-to-r from-[#4d3a1c] via-[#2e2416] to-[#4d3a1c] py-1 pl-1 pr-4 text-left shadow-md transition-colors hover:border-gold"
        aria-haspopup="true"
        [attr.aria-expanded]="menuOpen()"
        data-testid="realm-menu"
        (click)="menuOpen.set(!menuOpen())"
      >
        <span
          class="ml-1.5 flex h-8 w-8 rotate-45 items-center justify-center rounded-md border-2 border-gold bg-bg"
        >
          <mt-realm-icon [realm]="currentRealm()" class="h-5 w-5 -rotate-45" />
        </span>
        <span class="ml-1 font-display text-lg font-semibold text-ink" data-testid="realm-name">{{
          realmName(currentRealm())
        }}</span>
        <span class="ml-auto text-xs text-ink-dim">{{ countLabel() }}</span>
        <span
          class="text-gold transition-transform"
          [class.rotate-180]="menuOpen()"
          aria-hidden="true"
          >▾</span
        >
      </button>

      @if (menuOpen()) {
        <ul
          class="absolute inset-x-0 top-full z-30 mt-1 grid grid-cols-2 gap-1 rounded-md border border-gold/50 bg-panel p-2 shadow-2xl shadow-black/60 sm:grid-cols-4"
        >
          @for (code of realms; track code) {
            <li>
              <a
                routerLink="."
                [queryParams]="{ realm: code }"
                queryParamsHandling="merge"
                class="flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
                [class]="
                  code === currentRealm()
                    ? 'bg-gold/15 text-gold'
                    : 'text-ink-dim hover:bg-raised hover:text-ink'
                "
                [attr.aria-current]="code === currentRealm() ? 'true' : null"
                (click)="menuOpen.set(false)"
              >
                <mt-realm-icon [realm]="code" class="h-5 w-5" />
                {{ realmName(code) }}
              </a>
            </li>
          }
        </ul>
      }
    </div>

    @if (filterOpen()) {
      <div
        class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel p-2"
        data-testid="collection-filters"
      >
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
              class="w-7 rounded border py-1 text-xs transition-colors"
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
        @if (filtered()) {
          <button
            type="button"
            class="text-xs text-ink-faint hover:text-ink"
            (click)="clearFilters()"
          >
            Clear
          </button>
        }
      </div>
    }

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
      @if (currentTab() === 'spells' && currentRealm() === neutral) {
        <p class="mt-4 text-center text-xs text-ink-faint">
          Sanctum spells belong to no realm — any draft can be offered them.
        </p>
      }

      <ul
        class="mt-6 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
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

    <!-- The game's bottom bar: the three tabs, and the funnel beside them. -->
    <nav
      class="sticky bottom-3 z-20 mt-10 flex items-center justify-center gap-3"
      aria-label="Card type"
    >
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

      <button
        type="button"
        class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-gradient-to-b from-[#4d3a1c] to-[#241c12] text-gold shadow-xl shadow-black/60 transition-colors hover:text-gold-bright"
        aria-label="Filter"
        [attr.aria-expanded]="filterOpen()"
        data-testid="collection-filter-toggle"
        (click)="filterOpen.set(!filterOpen())"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" />
        </svg>
        @if (filtered()) {
          <span class="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-health"></span>
        }
      </button>
    </nav>

    <mt-card-preview />
  `,
})
export class CollectionPage {
  protected readonly catalog = inject(CatalogService);
  protected readonly preview = inject(CardPreview);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Bound from `?realm=`; anything unrecognised reads as the realm the game opens on. */
  readonly realm = input<string>();
  /** Bound from `?tab=`. */
  readonly tab = input<string>();

  protected readonly realms = REALMS_IN_GAME_ORDER;
  protected readonly tabs = COLLECTION_TABS;
  protected readonly tabLabel = TAB_LABEL;
  protected readonly tiers = TIERS;
  protected readonly neutral = NEUTRAL_REALM;

  protected readonly currentRealm = computed(() => toCollectionRealm(this.realm()));
  protected readonly currentTab = computed(() => toCollectionTab(this.tab()));

  protected readonly menuOpen = signal(false);
  protected readonly filterOpen = signal(false);
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
      this.currentTab(),
      this.currentRealm(),
      { query: this.query(), tier: this.tier() },
    ),
  );

  protected readonly countLabel = computed(() => {
    if (!this.catalog.value()) return '';
    const count = this.cards().length;
    const noun = { gods: 'patron god', units: 'unit', spells: 'spell' }[this.currentTab()];
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
  });

  protected readonly emptyMessage = computed(() => {
    if (this.filtered()) return 'Nothing matches these filters.';
    const realm = this.realmName(this.currentRealm());
    if (this.currentTab() === 'gods') return `${realm} has no patron god.`;
    if (this.currentTab() === 'spells') return `${realm} has no spells of its own.`;
    return `${realm} has no units.`;
  });

  protected realmName(code: RealmCode): string {
    return this.realmNames().get(code) ?? code.charAt(0).toUpperCase() + code.slice(1);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.tier.set(null);
  }

  protected closeMenuFromOutside(event: Event): void {
    if (!this.menuOpen()) return;
    const menu = this.host.nativeElement.querySelector('[data-realm-menu]');
    if (menu && !menu.contains(event.target as Node)) this.menuOpen.set(false);
  }
}
