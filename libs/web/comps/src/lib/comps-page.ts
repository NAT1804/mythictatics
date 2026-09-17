import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  NEUTRAL_REALM,
  REALM_CODES,
  type Comp,
  type CompDifficulty,
  type RealmCode,
} from '@mythictatics/shared/contracts';
import { filterComps } from '@mythictatics/shared/domain';
import { CardPreview, CatalogService, RealmIcon } from '@mythictatics/web/builder';
import { CompBoard } from './comp-board';
import { CompsService } from './comps-data';

export const COMP_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1N5rRWMOt8_MsDWu2YeL8Qt8Mw1bTZ3qaKMhXAeZQ094/edit?gid=518855883';

/**
 * Every comp, as a grid of cards that each show the board at a glance.
 *
 * The board thumbnail is the point of the card: players recognise a comp by its units long before
 * they remember what the sheet called it. Filtering is by what a player knows mid-run — how
 * confident they are, which realm they were dealt, a unit they already hold.
 */
@Component({
  selector: 'mt-comps-page',
  imports: [CompBoard, RealmIcon, RouterLink],
  providers: [CardPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl font-bold text-gold">Team Comps</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-dim">
          Community comps with their ideal board, when to commit and how to pilot them. Open one to
          read the guide, or take its board straight into the builder.
        </p>
      </div>
      <a
        [href]="sheetUrl"
        target="_blank"
        rel="noopener"
        class="text-xs text-ink-faint underline decoration-line underline-offset-4 hover:text-gold"
        >Source: community comp sheet ↗</a
      >
    </header>

    <!-- Filters -->
    <div class="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-panel p-3">
      <div class="flex flex-wrap items-center gap-2">
        <input
          type="search"
          class="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold focus:outline-none"
          placeholder="Search a comp or a unit — e.g. Prometheus"
          aria-label="Search comps"
          data-testid="comp-search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <div class="flex gap-1" role="group" aria-label="Difficulty">
          @for (option of difficulties; track option.label) {
            <button
              type="button"
              class="rounded-md border px-2.5 py-1 text-xs"
              [class]="
                difficulty() === option.value
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-line text-ink-dim hover:text-ink'
              "
              [attr.aria-pressed]="difficulty() === option.value"
              (click)="difficulty.set(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Realm">
        @for (code of realms; track code) {
          <button
            type="button"
            class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs capitalize"
            [class]="
              realm() === code
                ? 'border-gold bg-gold/10 text-gold'
                : 'border-line text-ink-dim hover:text-ink'
            "
            [attr.aria-pressed]="realm() === code"
            (click)="realm.set(realm() === code ? null : code)"
          >
            <mt-realm-icon [realm]="code" class="h-3.5 w-3.5" />
            {{ code }}
          </button>
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

    @if (comps.error() || catalog.error()) {
      <div class="mt-10 text-center">
        <p class="text-sm text-red-300">The comps could not be loaded.</p>
        <button
          type="button"
          class="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-gold hover:text-gold"
          (click)="reload()"
        >
          Try again
        </button>
      </div>
    } @else if (!ready()) {
      <p class="mt-10 text-center text-sm text-ink-faint">Loading comps…</p>
    } @else {
      <p class="mt-4 text-xs text-ink-faint" data-testid="comp-count">
        {{ visible().length }} of {{ comps.comps().length }} comps
      </p>

      <ul class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (comp of visible(); track comp.id) {
          <li>
            <a
              [routerLink]="['/comps', comp.slug]"
              class="flex h-full flex-col gap-3 rounded-lg border border-line bg-panel p-4 transition-colors hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              data-testid="comp-card"
            >
              <div class="flex items-start justify-between gap-2">
                <h2 class="font-display text-lg leading-tight text-ink">{{ comp.name }}</h2>
                <span
                  class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
                  [class]="
                    comp.difficulty === 'advanced'
                      ? 'border-gold/60 text-gold'
                      : 'border-line text-ink-dim'
                  "
                  >{{ comp.difficulty }}</span
                >
              </div>

              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-dim">
                <span class="flex items-center gap-1">
                  @for (code of realmsOf(comp); track code) {
                    <mt-realm-icon [realm]="code" class="h-4 w-4" [attr.title]="code" />
                  }
                </span>
                <span>{{ patronLabel(comp) }}</span>
              </div>

              <mt-comp-board [board]="comp.idealBoard" [compact]="true" />

              @if (comp.whenToCommit) {
                <p class="line-clamp-2 text-xs text-ink-dim">
                  <span class="text-ink-faint">Commit:</span> {{ comp.whenToCommit }}
                </p>
              }
            </a>
          </li>
        } @empty {
          <li class="col-span-full py-10 text-center text-sm text-ink-faint">
            No comp matches these filters.
          </li>
        }
      </ul>
    }
  `,
})
export class CompsPage {
  protected readonly comps = inject(CompsService);
  protected readonly catalog = inject(CatalogService);

  protected readonly sheetUrl = COMP_SHEET_URL;
  protected readonly realms = REALM_CODES.filter((code) => code !== NEUTRAL_REALM);
  protected readonly difficulties: readonly { label: string; value: CompDifficulty | null }[] = [
    { label: 'All', value: null },
    { label: 'Basic', value: 'basic' },
    { label: 'Advanced', value: 'advanced' },
  ];

  protected readonly query = signal('');
  protected readonly difficulty = signal<CompDifficulty | null>(null);
  protected readonly realm = signal<RealmCode | null>(null);

  /** Both files are needed before a card can be drawn: the comps name units, the catalog has them. */
  protected readonly ready = computed(() => !!this.catalog.value() && this.comps.loaded());

  protected readonly filtered = computed(
    () => !!this.query().trim() || this.difficulty() !== null || this.realm() !== null,
  );

  protected readonly visible = computed(() =>
    filterComps(
      this.comps.comps(),
      { difficulty: this.difficulty(), realm: this.realm(), query: this.query() },
      (id) => this.catalog.unit(id)?.name,
      (id) => this.catalog.unit(id)?.realm,
    ),
  );

  /** The realms the comp drafts; one that drafts none is a Neutral comp, and says so. */
  protected realmsOf(comp: Comp): RealmCode[] {
    return comp.realms.length ? comp.realms : [NEUTRAL_REALM];
  }

  protected patronLabel(comp: Comp): string {
    if (!comp.patronGodIds.length) return 'Any patron god';
    return comp.patronGodIds.map((id) => this.catalog.god(id)?.name ?? id).join(' / ');
  }

  protected clearFilters(): void {
    this.query.set('');
    this.difficulty.set(null);
    this.realm.set(null);
  }

  protected reload(): void {
    this.comps.reload();
    this.catalog.reload();
  }
}
