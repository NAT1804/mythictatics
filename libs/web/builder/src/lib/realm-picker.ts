import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NEUTRAL_REALM, type Realm, type RealmCode } from '@mythictatics/shared/contracts';
import { BuilderStore } from './builder-store';
import { CatalogService } from './catalog';
import { RealmIcon } from './realm-icon';
import { REALM_BORDER, REALM_TEXT } from './realm-style';

type ChipState = 'locked' | 'picked' | 'available' | 'full' | 'always';

/**
 * The three-realm draft.
 *
 * Neutral is shown with the rest but never costs a pick — it is always buyable, and saying so on
 * screen is cheaper than explaining later why a Neutral unit is in a list the player did not
 * draft. A realm the patron god locked is shown as the god's, not as a pick, because releasing it
 * means changing god or releasing the lock, not clicking here.
 */
@Component({
  selector: 'mt-realm-picker',
  imports: [RealmIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'realm-picker' },
  template: `
    <div
      class="flex flex-wrap items-baseline gap-x-2 gap-y-1 lg:flex-nowrap lg:items-start lg:gap-3"
    >
      <div
        class="flex flex-1 items-baseline justify-between gap-2 lg:w-16 lg:flex-none lg:flex-col lg:items-start lg:gap-0 lg:pt-1"
      >
        <h2 class="font-display text-lg text-gold lg:text-sm lg:leading-tight">Realms</h2>
        <span class="text-[11px] text-ink-faint">
          @if (store.picksLeft(); as left) {
            pick {{ left }} more
          } @else {
            draft complete
          }
        </span>
      </div>

      <ul
        class="grid w-full min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-5 lg:w-auto lg:flex-1 lg:grid-cols-9"
      >
        @for (realm of realms(); track realm.code) {
          @let state = stateOf(realm.code);
          @let onBoard = store.unitsOnBoardFrom(realm.code);
          <li>
            <button
              type="button"
              class="relative flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors lg:flex-col lg:gap-0.5 lg:px-1 lg:py-1"
              [class]="chipClass(realm.code, state)"
              [disabled]="state === 'always' || state === 'locked' || state === 'full'"
              [attr.aria-pressed]="state === 'picked' || state === 'locked'"
              [title]="hint(realm, state, onBoard)"
              (click)="store.toggleRealm(realm.code)"
            >
              <mt-realm-icon
                [realm]="realm.code"
                class="h-4 w-4"
                [class.opacity-40]="state === 'available' || state === 'full'"
              />
              <span
                class="min-w-0 flex-1 truncate lg:w-full lg:flex-none lg:text-center lg:text-[10px]"
                >{{ realm.name }}</span
              >
              @if (state === 'locked') {
                <span
                  class="shrink-0 text-[10px] text-gold lg:absolute lg:right-0.5 lg:top-0.5"
                  aria-hidden="true"
                  >&#128274;</span
                >
              } @else if (state === 'always') {
                <span
                  class="shrink-0 text-[10px] text-ink-faint lg:absolute lg:right-0.5 lg:top-0.5"
                  >any</span
                >
              } @else if (onBoard) {
                <span
                  class="shrink-0 text-[10px] text-ink-faint lg:absolute lg:right-0.5 lg:top-0.5"
                  >{{ onBoard }}</span
                >
              }
            </button>
          </li>
        }
      </ul>
    </div>
  `,
})
export class RealmPicker {
  protected readonly store = inject(BuilderStore);
  private readonly catalog = inject(CatalogService);

  protected readonly realms = computed(() => this.catalog.realms());

  protected stateOf(code: RealmCode): ChipState {
    if (code === NEUTRAL_REALM) return 'always';
    if (this.store.draft().locked === code) return 'locked';
    if (this.store.pickedRealms().includes(code)) return 'picked';
    return this.store.picksLeft() > 0 ? 'available' : 'full';
  }

  protected chipClass(code: RealmCode, state: ChipState): string {
    if (state === 'locked') return `${REALM_BORDER[code]} bg-gold/10 ${REALM_TEXT[code]}`;
    if (state === 'picked') return `${REALM_BORDER[code]} bg-raised ${REALM_TEXT[code]}`;
    if (state === 'always') return 'border-line bg-panel text-ink-dim';
    if (state === 'full') return 'border-line/60 bg-panel text-ink-faint opacity-50';
    return 'border-line bg-panel text-ink-dim hover:border-gold hover:text-ink';
  }

  /** Says what a click will cost, since dropping a realm also takes its units off the board. */
  protected hint(realm: Realm, state: ChipState, onBoard: number): string {
    if (state === 'always') return `${realm.name} units can always be bought`;
    if (state === 'locked') return `Locked in by your patron god`;
    if (state === 'full') return 'The draft is full — drop a realm first';
    if (state !== 'picked') return `Draft ${realm.name}`;
    return onBoard
      ? `Drop ${realm.name} — takes ${onBoard} unit${onBoard > 1 ? 's' : ''} off the board`
      : `Drop ${realm.name}`;
  }
}
