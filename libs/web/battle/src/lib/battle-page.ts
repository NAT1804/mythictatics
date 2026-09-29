import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { BattleEvent, Comp, God, SideIndex } from '@mythictatics/shared/contracts';
import { encodeShareCode } from '@mythictatics/shared/domain';
import {
  EMPTY_VIEW,
  createCardLookup,
  hashEvents,
  randomSeed,
  replayViews,
  simulate,
  type CardLookup,
  type ReplayView,
} from '@mythictatics/shared/engine';
import { CardPreview, CardPreviewDialog, CatalogService } from '@mythictatics/web/builder';
import { CompsService } from '@mythictatics/web/comps';
import { BattleBoard } from './battle-board';
import { BattleDirector } from './battle-director';
import { battleLog, endText, type LogLine } from './battle-log';
import {
  BATTLE_PARAM_KEYS,
  OPPONENT_LEVELS,
  RANDOM_OPPONENT,
  compBuild,
  planMatch,
  readBattleQuery,
  type OpponentLevelParam,
} from './battle-match';

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];
type Playback = 'idle' | 'playing' | 'paused' | 'done';

/**
 * `/battle`: the board from the builder against an AI, fought by the shared engine and played
 * back on the page.
 *
 * ## Where the fight happens
 *
 * Entirely in the browser, and entirely before anything moves: `simulate` fights the battle to
 * its end in a millisecond or two, `replayViews` folds the log into one board per event, and only
 * then does `BattleDirector` start walking through them with GSAP. So the result is known before
 * the first lunge — the animation is a replay, never the fight itself — and skipping, pausing or
 * playing at x4 cannot change who wins. It is the same engine a Worker will run to referee a
 * ranked fight, which is the point of it being in `libs/shared`.
 *
 * ## What is rendered where
 *
 * The route is prerendered as its loading state, like the builder: the board lives in the query
 * string, which a prerendered page cannot see, and GSAP is only ever imported in the browser, on
 * this route, after the page has rendered. Nothing of the battle reaches the server bundle.
 */
@Component({
  selector: 'mt-battle-page',
  imports: [BattleBoard, CardPreviewDialog, RouterLink],
  providers: [CardPreview],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl font-bold text-gold">Battle</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-dim">
          Take a board from the builder into a fight against the AI. The result is decided the
          moment the battle starts — what you watch is its replay, and the link replays it again.
        </p>
      </div>
    </header>

    @if (catalog.error()) {
      <div class="mt-10 text-center">
        <p class="text-sm text-red-300">The card data could not be loaded.</p>
        <button
          type="button"
          class="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-gold hover:text-gold"
          (click)="catalog.reload()"
        >
          Try again
        </button>
      </div>
    } @else if (!ready()) {
      <p class="mt-10 text-center text-sm text-ink-faint" data-testid="battle-loading">
        Loading the cards…
      </p>
    } @else {
      @let current = plan();
      @if (current && !current.ok && current.reason !== 'no-seed') {
        <section class="mt-6 rounded-lg border border-line bg-panel p-4" data-testid="team-picker">
          @if (current.reason === 'no-board') {
            <h2 class="font-display text-xl text-gold">Choose your team</h2>
            <p class="mt-1 text-sm text-ink-dim">
              Build a board in the builder and press <span class="text-ink">Battle</span>, or take a
              community comp into a fight straight away.
            </p>
          } @else {
            <h2 class="font-display text-xl text-gold">That board cannot be read</h2>
            <p class="mt-1 text-sm text-ink-dim">
              {{
                current.reason === 'bad-code'
                  ? 'The link does not hold a board this site understands.'
                  : 'None of the units on that board are in the current card data.'
              }}
              Pick a team to fight with instead.
            </p>
          }
          <div class="mt-4 flex flex-wrap gap-2">
            <a
              routerLink="/builder"
              class="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-bg"
              >Open the Team Builder</a
            >
          </div>
          <ul class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            @for (comp of comps.comps(); track comp.id) {
              <li>
                <button
                  type="button"
                  class="w-full rounded-md border border-line bg-raised/50 px-3 py-2 text-left text-sm text-ink hover:border-gold hover:text-gold"
                  [attr.data-testid]="'pick-' + comp.slug"
                  (click)="useComp(comp)"
                >
                  {{ comp.name }}
                  <span class="block text-xs text-ink-faint">{{ comp.difficulty }}</span>
                </button>
              </li>
            }
          </ul>
        </section>
      } @else {
        <!-- The match bar: who is fighting whom, and the controls that change it. -->
        <section
          class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm"
          aria-label="Match"
        >
          <label class="flex items-center gap-2 text-ink-dim">
            Opponent
            <!-- "selected" on each option rather than "value" on the select: the options are
                 drawn after the select's value would be bound, which would leave it on the
                 first one. -->
            <select
              class="rounded-md border border-line bg-raised px-2 py-1 text-ink"
              data-testid="opponent-select"
              (change)="setOpponent($any($event.target).value)"
            >
              <option [value]="random" [selected]="query().opponent === random">
                Random board
              </option>
              @for (comp of comps.comps(); track comp.id) {
                <option [value]="comp.slug" [selected]="query().opponent === comp.slug">
                  {{ comp.name }}
                </option>
              }
            </select>
          </label>
          <label class="flex items-center gap-2 text-ink-dim">
            Level
            <select
              class="rounded-md border border-line bg-raised px-2 py-1 text-ink"
              data-testid="level-select"
              (change)="setLevel($any($event.target).value)"
            >
              @for (level of levels; track level) {
                <option [value]="level" [selected]="query().level === level">
                  Rank {{ level }}
                </option>
              }
            </select>
          </label>
          <div class="ml-auto flex flex-wrap items-center gap-2">
            <a
              [routerLink]="['/builder']"
              [queryParams]="builderParams()"
              class="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-gold hover:text-gold"
              >Edit team</a
            >
            <button
              type="button"
              class="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-gold hover:text-gold"
              (click)="copyLink()"
            >
              {{ copied() ? 'Link copied' : 'Copy replay link' }}
            </button>
            <button
              type="button"
              class="rounded-md bg-gold px-3 py-1 text-xs font-medium text-bg hover:bg-gold-bright"
              data-testid="new-battle"
              (click)="newBattle()"
            >
              New battle
            </button>
          </div>
        </section>

        <div class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section class="relative min-w-0" aria-label="Battlefield" #stage>
            <!-- Sized so both boards fit the window together: four rows of tiles run about 1.67
                 times the boards' width, and the labels, the round line and the gaps about 15rem
                 more. The page scrolls the battlefield into view when a fight starts. -->
            <div
              data-part="stage"
              class="relative mx-auto flex max-w-[min(34rem,max(18rem,calc((100dvh-16rem)/1.67)))] flex-col gap-2"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="truncate font-display text-lg text-ink" data-testid="enemy-label">
                  {{ opponentName() }}
                </p>
                @if (patronOf(1); as god) {
                  <span class="relative flex items-center gap-2 text-xs text-ink-dim">
                    <span
                      data-part="patron-1"
                      class="pointer-events-none absolute -inset-1 rounded-full opacity-0 ring-2 ring-gold-bright shadow-[0_0_16px_rgba(235,196,99,0.7)]"
                    ></span>
                    <img [src]="god.powerImage" alt="" class="size-7 rounded-full" />
                    {{ god.name }}
                  </span>
                }
              </div>

              <mt-battle-board [view]="view()" [side]="1" [flipped]="true" />

              <div class="flex items-center gap-3" aria-live="polite">
                <span
                  class="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent"
                ></span>
                <span
                  data-part="round"
                  class="inline-block rounded-full border border-gold/50 bg-bg px-3 py-0.5 font-display text-sm text-gold"
                  data-testid="battle-round"
                  >{{ view().round ? 'Round ' + view().round : 'Start' }}</span
                >
                <span
                  class="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent"
                ></span>
              </div>

              <mt-battle-board [view]="view()" [side]="0" />

              <div class="flex items-center justify-between gap-2">
                <p class="font-display text-lg text-ink">Your team</p>
                @if (patronOf(0); as god) {
                  <span class="relative flex items-center gap-2 text-xs text-ink-dim">
                    <span
                      data-part="patron-0"
                      class="pointer-events-none absolute -inset-1 rounded-full opacity-0 ring-2 ring-gold-bright shadow-[0_0_16px_rgba(235,196,99,0.7)]"
                    ></span>
                    <img [src]="god.powerImage" alt="" class="size-7 rounded-full" />
                    {{ god.name }}
                  </span>
                }
              </div>
            </div>

            @if (view().end; as end) {
              <div
                class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-bg/35"
                data-testid="battle-result"
                [attr.data-winner]="end.winner ?? 'draw'"
              >
                <div
                  class="pointer-events-auto rounded-xl border border-gold/60 bg-panel/95 px-6 py-5 text-center shadow-2xl"
                >
                  <p class="font-display text-4xl font-bold" [class]="resultTone(end.winner)">
                    {{ end.winner === 0 ? 'Victory' : end.winner === 1 ? 'Defeat' : 'Draw' }}
                  </p>
                  <p class="mt-1 text-sm text-ink-dim">{{ endLine() }}</p>
                  @if (result(); as done) {
                    @if (done.damage) {
                      <p class="mt-1 text-xs text-ink-faint">
                        {{ end.winner === 0 ? 'Your survivors deal' : 'Their survivors deal' }}
                        {{ done.damage }} damage
                      </p>
                    }
                  }
                  <div class="mt-4 flex justify-center gap-2">
                    <button
                      type="button"
                      class="rounded-md border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-gold hover:text-gold"
                      (click)="replay()"
                    >
                      Watch again
                    </button>
                    <button
                      type="button"
                      class="rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-bg"
                      (click)="newBattle()"
                    >
                      New battle
                    </button>
                  </div>
                </div>
              </div>
            }
          </section>

          <aside class="flex min-w-0 flex-col gap-3">
            <div class="rounded-lg border border-line bg-panel p-3" aria-label="Playback">
              <div class="flex flex-wrap items-center gap-2">
                <div
                  class="flex overflow-hidden rounded-md border border-line"
                  role="group"
                  aria-label="Speed"
                >
                  @for (option of speeds; track option) {
                    <button
                      type="button"
                      class="px-2.5 py-1 text-xs"
                      [class]="
                        speed() === option ? 'bg-gold text-bg' : 'text-ink-dim hover:text-gold'
                      "
                      [attr.aria-pressed]="speed() === option"
                      [attr.data-testid]="'speed-' + option"
                      (click)="setSpeed(option)"
                    >
                      ×{{ option }}
                    </button>
                  }
                </div>
                <button
                  type="button"
                  class="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-gold hover:text-gold disabled:opacity-40"
                  [disabled]="playback() === 'done' || playback() === 'idle'"
                  (click)="togglePause()"
                >
                  {{ playback() === 'paused' ? 'Resume' : 'Pause' }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-gold hover:text-gold disabled:opacity-40"
                  data-testid="skip"
                  [disabled]="playback() === 'done'"
                  (click)="skip()"
                >
                  Skip to result
                </button>
              </div>
              @if (result(); as done) {
                <p class="mt-2 text-[11px] text-ink-faint">
                  Seed {{ done.setup.seed }} · replay
                  <span class="font-mono" data-testid="battle-hash">{{ hash() }}</span>
                </p>
              }
            </div>

            <div class="rounded-lg border border-line bg-panel p-3">
              <h2 class="font-display text-sm text-gold">Battle log</h2>
              <ol
                class="mt-2 flex max-h-[26rem] flex-col-reverse gap-0.5 overflow-y-auto text-xs"
                data-testid="battle-log"
              >
                @for (line of shownLog(); track line.index) {
                  <li [class]="lineTone(line)">
                    {{ line.text }}
                    @if (line.count > 1) {
                      <span class="text-ink-faint">×{{ line.count }}</span>
                    }
                  </li>
                }
              </ol>
            </div>
          </aside>
        </div>
      }
    }

    <mt-card-preview />
  `,
})
export class BattlePage {
  protected readonly catalog = inject(CatalogService);
  protected readonly comps = inject(CompsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly random = RANDOM_OPPONENT;
  protected readonly levels = OPPONENT_LEVELS;
  protected readonly speeds = SPEEDS;

  private readonly params = toSignal(this.route.queryParams, { initialValue: {} });
  protected readonly query = computed(() =>
    readBattleQuery(this.params() as Record<string, string>),
  );

  protected readonly ready = computed(() => !!this.catalog.value() && this.comps.loaded());

  private readonly lookup = computed<CardLookup | null>(() => {
    const catalog = this.catalog.value();
    return catalog ? createCardLookup(catalog.units, catalog.gods) : null;
  });

  protected readonly plan = computed(() => {
    const lookup = this.lookup();
    if (!lookup || !this.comps.loaded()) return null;
    return planMatch(this.query(), lookup, this.comps.comps());
  });

  protected readonly result = computed(() => {
    const plan = this.plan();
    const lookup = this.lookup();
    return plan?.ok && lookup ? simulate(plan.setup, lookup) : null;
  });

  private readonly views = computed<ReplayView[]>(() => {
    const result = this.result();
    return result ? replayViews(result.events) : [];
  });

  /** The event the playback has reached; the board shows the view after it. */
  private readonly index = signal(0);
  protected readonly view = computed(() => this.views()[this.index()] ?? EMPTY_VIEW);

  protected readonly hash = computed(() => {
    const result = this.result();
    return result ? hashEvents(result.events) : '';
  });

  private readonly log = computed<LogLine[]>(() => {
    const result = this.result();
    if (!result) return [];
    return battleLog(result.events, this.views(), {
      fighter: (uid, view) => {
        const fighter = view.fighters.get(uid);
        if (!fighter) return 'Someone';
        const card = fighter.godId
          ? this.catalog.god(fighter.godId)
          : this.catalog.unit(fighter.unitId);
        return `${fighter.side === 0 ? 'Your' : 'Enemy'} ${card?.name ?? fighter.unitId}`;
      },
      card: (id) => this.catalog.unit(id)?.name ?? this.catalog.god(id)?.name ?? id,
      status: (code) => this.catalog.keywordTitle(code),
    });
  });

  /** Newest first, up to where the playback is, each line counting only what has happened yet. */
  protected readonly shownLog = computed(() => {
    const index = this.index();
    return this.log()
      .filter((line) => line.index <= index)
      .map((line) => ({ ...line, count: line.indices.filter((at) => at <= index).length }))
      .reverse();
  });

  protected readonly opponentName = computed(() => {
    const plan = this.plan();
    if (!plan?.ok) return 'Opponent';
    return plan.opponent.kind === 'comp' ? plan.opponent.comp.name : 'Random board';
  });

  protected readonly endLine = computed(() => {
    const end = this.view().end;
    return end ? endText(end) : '';
  });

  protected readonly builderParams = computed(() => {
    const query = this.query();
    return { d: query.code, ds: query.descendSlot };
  });

  protected readonly speed = signal<Speed>(1);
  protected readonly playback = signal<Playback>('idle');
  protected readonly copied = signal(false);

  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private director: BattleDirector | null = null;
  /** Bumped per result, so a GSAP import that lands after the fight changed is ignored. */
  private generation = 0;
  private skipped = false;

  constructor() {
    // A battle without a seed gets one, written into the address so the link replays it.
    effect(() => {
      const plan = this.plan();
      if (!this.browser || !plan || plan.ok || plan.reason !== 'no-seed') return;
      untracked(() => this.navigate({ [BATTLE_PARAM_KEYS.seed]: String(randomSeed()) }, true));
    });

    afterRenderEffect(() => {
      const result = this.result();
      const views = this.views();
      const stage = this.stage()?.nativeElement;
      untracked(() => this.start(result ? { events: result.events, views, stage } : null));
    });

    inject(DestroyRef).onDestroy(() => this.director?.destroy());
  }

  /** Throws away whatever was playing and plays `fight` from its first event. */
  private start(
    fight: {
      events: readonly BattleEvent[];
      views: readonly ReplayView[];
      stage?: HTMLElement;
    } | null,
  ): void {
    const generation = ++this.generation;
    this.director?.destroy();
    this.director = null;
    this.skipped = false;
    this.index.set(0);
    if (!fight || !fight.stage) {
      this.playback.set('idle');
      return;
    }
    const { events, views, stage } = fight;
    const reduced = !!this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
      .matches;
    void import('gsap').then(({ gsap }) => {
      if (generation !== this.generation) return;
      this.director = new BattleDirector(
        gsap,
        stage,
        events,
        views,
        (index) => this.index.set(index),
        {
          reduced,
          onDone: () => this.playback.set('done'),
        },
      );
      // Skipped while GSAP was still loading: the result is already showing, so do not play it.
      if (this.skipped) return;
      this.playback.set('playing');
      this.director.play(this.speed());
      // Optional: jsdom has no scrolling.
      stage.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  protected patronOf(side: SideIndex): God | undefined {
    const id = this.result()?.setup.sides[side].patronGodId;
    return id ? this.catalog.god(id) : undefined;
  }

  protected setSpeed(speed: Speed): void {
    this.speed.set(speed);
    this.director?.setSpeed(speed);
  }

  protected togglePause(): void {
    if (!this.director) return;
    if (this.playback() === 'paused') {
      this.director.resume();
      this.playback.set('playing');
    } else {
      this.director.pause();
      this.playback.set('paused');
    }
  }

  /** Works before GSAP has loaded too: the views are all there already, so the last one is. */
  protected skip(): void {
    if (this.director) {
      this.director.skip();
      return;
    }
    const last = this.views().length - 1;
    if (last < 0) return;
    this.skipped = true;
    this.index.set(last);
    this.playback.set('done');
  }

  protected replay(): void {
    if (!this.director) return;
    this.playback.set('playing');
    this.director.play(this.speed());
  }

  protected newBattle(): void {
    this.navigate({ [BATTLE_PARAM_KEYS.seed]: String(randomSeed()) });
  }

  protected setOpponent(slug: string): void {
    this.navigate({ [BATTLE_PARAM_KEYS.opponent]: slug === RANDOM_OPPONENT ? null : slug });
  }

  protected setLevel(level: string): void {
    const value = Number(level) as OpponentLevelParam;
    this.navigate({ [BATTLE_PARAM_KEYS.level]: value === 1 ? null : String(value) });
  }

  protected useComp(comp: Comp): void {
    this.navigate({
      [BATTLE_PARAM_KEYS.code]: encodeShareCode(compBuild(comp)),
      [BATTLE_PARAM_KEYS.descend]: null,
    });
  }

  protected async copyLink(): Promise<void> {
    const url = this.document.defaultView?.location.href;
    if (!url) return;
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(url);
      this.copied.set(true);
      this.document.defaultView?.setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }

  protected resultTone(winner: SideIndex | null): string {
    return winner === 0 ? 'text-gold-bright' : winner === 1 ? 'text-red-300' : 'text-ink';
  }

  protected lineTone(line: LogLine): string {
    if (line.tone === 'round') return 'mt-1 font-display text-gold';
    if (line.tone === 'end') return 'mt-1 font-medium text-gold-bright';
    const side = line.side === 0 ? 'text-ink' : line.side === 1 ? 'text-[#e9a79c]' : 'text-ink-dim';
    return line.tone === 'trigger' || line.tone === 'status' ? `${side} opacity-70` : side;
  }

  private navigate(params: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }
}
