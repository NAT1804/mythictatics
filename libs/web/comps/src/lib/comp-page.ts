import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { NEUTRAL_REALM, type Board, type RealmCode } from '@mythictatics/shared/contracts';
import { compBuilderParams, lockedRealmOf, paragraphs } from '@mythictatics/shared/domain';
import {
  CardPreview,
  CardPreviewDialog,
  CatalogService,
  RealmIcon,
  RichText,
} from '@mythictatics/web/builder';
import { SITE_NAME } from '@mythictatics/web/shell';
import { CompBoard } from './comp-board';
import { CompsService } from './comps-data';
import { COMP_SHEET_URL } from './comps-page';
import { UnitList } from './unit-list';

/**
 * One comp, laid out in the order a player needs it during a run.
 *
 * The conditions come first — which realms, which patron, and the moment to commit — because they
 * decide whether the comp is on the table at all. Then the boards, then how to pilot it, then the
 * units grouped by how badly the comp needs them. Every board can be taken into the builder.
 */
@Component({
  selector: 'mt-comp-page',
  imports: [CardPreviewDialog, CompBoard, RealmIcon, RichText, RouterLink, UnitList],
  providers: [CardPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/comps" class="text-xs text-ink-faint hover:text-gold">← All comps</a>

    @if (comps.error() || catalog.error()) {
      <p class="mt-10 text-center text-sm text-red-300">The comp could not be loaded.</p>
    } @else if (!ready()) {
      <p class="mt-10 text-center text-sm text-ink-faint">Loading comp…</p>
    } @else if (comp(); as comp) {
      <header class="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-3xl font-bold text-gold">{{ comp.name }}</h1>
            <span
              class="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
              [class]="
                comp.difficulty === 'advanced'
                  ? 'border-gold/60 text-gold'
                  : 'border-line text-ink-dim'
              "
              >{{ comp.difficulty }}</span
            >
          </div>
          <p class="mt-1 text-xs text-ink-faint">
            From the community comp sheet · card data {{ comp.gameVersion }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a
            routerLink="/builder"
            [queryParams]="builderParams(comp.idealBoard)"
            class="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-bg hover:bg-gold-bright"
            data-testid="open-in-builder"
            >Open in Builder</a
          >
          <a
            [href]="comp.source.url ?? sheetUrl"
            target="_blank"
            rel="noopener"
            class="rounded-md border border-line px-3 py-1.5 text-sm text-ink-dim hover:border-gold hover:text-gold"
            >Sheet ↗</a
          >
        </div>
      </header>

      <!-- Conditions: what has to be true before this comp is worth going for. -->
      <section class="mt-6 grid gap-3 md:grid-cols-3" aria-label="Conditions">
        <div class="rounded-lg border border-line bg-panel p-3">
          <h2 class="text-[11px] uppercase tracking-widest text-ink-faint">Realms</h2>
          <ul class="mt-2 flex flex-wrap gap-1.5">
            @for (code of realms(); track code) {
              <li
                class="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs capitalize text-ink"
              >
                <mt-realm-icon [realm]="code" class="h-3.5 w-3.5" />
                {{ code }}
              </li>
            }
          </ul>
          @if (!comp.realms.length) {
            <p class="mt-2 text-[11px] text-ink-faint">
              Built on Neutral units, so any draft can play it.
            </p>
          }
        </div>

        <div class="rounded-lg border border-line bg-panel p-3">
          <h2 class="text-[11px] uppercase tracking-widest text-ink-faint">Patron god</h2>
          @for (god of patrons(); track god.id) {
            <div class="mt-2 flex gap-2">
              @if (god.image) {
                <img
                  [src]="god.image"
                  [alt]="god.name"
                  class="h-12 w-12 shrink-0 rounded-md border border-gold/50 object-cover object-top"
                />
              }
              <div class="min-w-0 text-xs">
                <p class="font-medium text-ink">
                  {{ god.name }}
                  @if (god.powerName) {
                    <span class="text-gold"> · {{ god.powerName }}</span>
                  }
                </p>
                <p class="mt-0.5 text-ink-dim"><mt-rich-text [tokens]="god.powerText" /></p>
              </div>
            </div>
          } @empty {
            <p class="mt-2 text-sm text-ink">Any</p>
            <p class="text-[11px] text-ink-faint">The comp does not depend on a god's Power.</p>
          }
        </div>

        <div class="rounded-lg border border-gold/40 bg-gold/5 p-3">
          <h2 class="text-[11px] uppercase tracking-widest text-gold">When to commit</h2>
          <p class="mt-2 text-sm text-ink" data-testid="when-to-commit">
            {{ comp.whenToCommit ?? 'The sheet does not say.' }}
          </p>
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <!-- Boards -->
        <section class="space-y-6">
          <div>
            <h2 class="font-display text-lg text-gold">Ideal board</h2>
            <mt-comp-board class="mt-2" [board]="comp.idealBoard" />
          </div>

          @for (board of comp.alternativeBoards; track $index) {
            <div>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-display text-lg text-gold">Alternative board</h2>
                <a
                  routerLink="/builder"
                  [queryParams]="builderParams(board)"
                  class="text-xs text-ink-faint hover:text-gold"
                  >Open in Builder →</a
                >
              </div>
              <mt-comp-board class="mt-2" [board]="board" />
            </div>
          }
        </section>

        <!-- Guide -->
        <section class="space-y-6">
          <div class="rounded-lg border border-line bg-panel p-4">
            <h2 class="font-display text-lg text-gold">How to play</h2>
            <div class="mt-2 space-y-3 text-sm leading-relaxed text-ink" data-testid="how-to-play">
              @for (paragraph of guide(); track $index) {
                <p class="whitespace-pre-line">{{ paragraph }}</p>
              }
            </div>
          </div>

          <mt-unit-list
            title="Core units"
            hint="What the comp is built around — the reason to commit."
            [unitIds]="comp.coreUnitIds"
          />
          <mt-unit-list
            title="Enablers"
            hint="Make the core units work; pick these up early."
            [unitIds]="comp.enablerUnitIds"
          />
          <mt-unit-list
            title="Add-ons"
            hint="Worth adding once the comp is running."
            [unitIds]="comp.addOnUnitIds"
          />
        </section>
      </div>

      <mt-card-preview />
    } @else {
      <div class="mt-10 text-center" data-testid="comp-not-found">
        <p class="font-display text-xl text-ink">No comp by that name.</p>
        <a routerLink="/comps" class="mt-3 inline-block text-sm text-gold hover:underline"
          >Browse all comps</a
        >
      </div>
    }
  `,
})
export class CompPage {
  protected readonly comps = inject(CompsService);
  protected readonly catalog = inject(CatalogService);
  private readonly title = inject(Title);

  /** Bound from the route's `:slug`. */
  readonly slug = input.required<string>();

  protected readonly sheetUrl = COMP_SHEET_URL;

  protected readonly ready = computed(() => !!this.catalog.value() && this.comps.loaded());
  protected readonly comp = computed(() => this.comps.comp(this.slug()));

  protected readonly patrons = computed(() =>
    (this.comp()?.patronGodIds ?? [])
      .map((id) => this.catalog.god(id))
      .filter((god) => god !== undefined),
  );

  protected readonly realms = computed<RealmCode[]>(() => [
    NEUTRAL_REALM,
    ...(this.comp()?.realms ?? []),
  ]);

  protected readonly guide = computed(() => paragraphs(this.comp()?.howToPlay));

  constructor() {
    // The route cannot know a comp's name before the data is in, so the tab title catches up here.
    effect(() => {
      const comp = this.comp();
      if (comp) this.title.setTitle(`${comp.name} · Comps · ${SITE_NAME}`);
    });
  }

  protected builderParams(board: Board): Record<string, string | null> {
    const comp = this.comp();
    if (!comp) return {};
    return compBuilderParams(comp, board, lockedRealmOf(this.patrons()[0]));
  }
}
