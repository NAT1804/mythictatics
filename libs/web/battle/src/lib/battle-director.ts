import type { BattleEvent } from '@mythictatics/shared/contracts';
import type { ReplayView } from '@mythictatics/shared/engine';

type Gsap = typeof import('gsap').gsap;
type Timeline = ReturnType<Gsap['timeline']>;

/**
 * Turns an event log into one GSAP timeline over the stage's DOM.
 *
 * ## The DOM it drives, and why it never goes stale
 *
 * The stage draws twelve slots whatever is in them, each with the same fixed parts: a `body` that
 * holds the card and is what lunges, shakes and fades; a `flash` and a `glow` over it; and three
 * `float` labels for the numbers that rise off a hit. Those elements live as long as the stage
 * does, so the whole timeline can be built up front, before a single frame plays, and seeking or
 * changing speed is GSAP's business alone. What a slot *shows* is Angular's: the timeline only
 * calls `step(i)` at the moment event `i` lands, and the page draws `views[i]`.
 *
 * ## Time
 *
 * Every event gets a place on the timeline and a `beat` — how long until the next event starts.
 * Tweens are laid down at explicit times rather than appended, so a lunge can come back while the
 * hit it delivered is still flashing: the beat, not the tween, decides the pace. Speed is the
 * timeline's `timeScale`; the fight's outcome never depends on any of it.
 *
 * With reduced motion the same events play with no travel at all — fades only, and quicker.
 */
export class BattleDirector {
  private timeline: Timeline | null = null;
  private readonly floatTurn = new Map<string, number>();

  constructor(
    private readonly gsap: Gsap,
    private readonly root: HTMLElement,
    private readonly events: readonly BattleEvent[],
    private readonly views: readonly ReplayView[],
    private readonly step: (index: number) => void,
    private readonly options: { reduced: boolean; onDone: () => void },
  ) {}

  play(speed: number): void {
    this.destroy();
    this.step(0);
    const timeline = this.gsap.timeline({ paused: true, onComplete: () => this.finish() });
    this.build(timeline);
    timeline.timeScale(speed).play();
    this.timeline = timeline;
  }

  setSpeed(speed: number): void {
    this.timeline?.timeScale(speed);
  }

  pause(): void {
    this.timeline?.pause();
  }

  resume(): void {
    this.timeline?.resume();
  }

  get paused(): boolean {
    return this.timeline?.paused() ?? false;
  }

  /** To the end at once: the last view, and every transient effect cleared. */
  skip(): void {
    this.destroy();
    this.finish();
  }

  destroy(): void {
    this.timeline?.kill();
    this.timeline = null;
    this.clear();
  }

  private finish(): void {
    this.clear();
    this.step(this.events.length - 1);
    this.options.onDone();
  }

  private clear(): void {
    const parts = this.root.querySelectorAll('[data-part]');
    if (parts.length) this.gsap.set(parts, { clearProps: 'all' });
  }

  private build(tl: Timeline): void {
    const reduced = this.options.reduced;
    const pace = reduced ? 0.4 : 1;
    let t = 0;

    this.events.forEach((event, index) => {
      const before = this.views[index - 1];
      const after = this.views[index];
      const at = t;
      const call = (fn: () => void, time = at) => tl.call(fn, [], time);
      const beat = (seconds: number) => (t += seconds * pace);

      switch (event.type) {
        case 'start': {
          call(() => this.step(index));
          const bodies = this.parts('body');
          if (!reduced) tl.from(bodies, { opacity: 0, y: 14, duration: 0.45, stagger: 0.03 }, at);
          beat(0.6);
          break;
        }
        case 'round': {
          call(() => this.step(index));
          const badge = this.root.querySelector('[data-part="round"]');
          if (badge && !reduced) {
            tl.fromTo(
              badge,
              { scale: 1.35 },
              { scale: 1, duration: 0.35, ease: 'back.out(2)' },
              at,
            );
          }
          beat(0.35);
          break;
        }
        case 'turn':
          call(() => this.step(index));
          beat(0.18);
          break;
        case 'attack': {
          call(() => this.step(index));
          const attacker = this.slotOf(after, event.uid);
          const target = this.slotOf(after, event.target);
          if (attacker && target && !reduced) {
            const body = this.part(attacker, 'body');
            const reach = () => this.offset(attacker, target, 0.55);
            tl.to(
              body,
              { x: () => reach().x, y: () => reach().y, duration: 0.16, ease: 'power2.in' },
              at,
            );
            tl.to(body, { x: 0, y: 0, duration: 0.24, ease: 'power2.out' }, at + 0.24);
          }
          beat(0.16);
          break;
        }
        case 'damage': {
          call(() => this.step(index));
          const slot = this.slotOf(before ?? after, event.uid);
          if (slot) {
            const text = event.blocked ? 'Blocked' : event.saved ? 'Saved!' : `-${event.amount}`;
            const tone = event.blocked ? '#8fb8ff' : event.kind === 'burn' ? '#ff9a3c' : '#ff5a5a';
            this.float(tl, slot, text, tone, at, event.lethal ? 1.35 : 1);
            const flash = this.part(slot, 'flash');
            tl.fromTo(
              flash,
              { opacity: event.blocked ? 0.3 : 0.65 },
              { opacity: 0, duration: 0.3 },
              at,
            );
            if (!reduced && !event.blocked) {
              tl.fromTo(
                this.part(slot, 'body'),
                { x: -5 },
                { x: 0, duration: 0.28, ease: 'elastic.out(1.2, 0.3)' },
                at,
              );
              if (event.amount >= 20 || event.lethal) this.quake(tl, at);
            }
          }
          beat(
            event.kind === 'attack' || event.kind === 'splash'
              ? 0.04
              : event.kind === 'burn'
                ? 0.12
                : 0.18,
          );
          break;
        }
        case 'stats': {
          call(() => this.step(index));
          const slot = this.slotOf(after, event.uid);
          const was = before?.fighters.get(event.uid);
          if (slot && was) {
            const attack = event.attack - was.attack;
            const health = event.health - was.health;
            const text = `${sign(attack)}/${sign(health)}`;
            const gain = attack >= 0 && health >= 0;
            this.float(tl, slot, text, gain ? '#7ee08a' : '#e0c27e', at, 0.9);
            if (!reduced) {
              tl.fromTo(this.part(slot, 'body'), { scale: 1.07 }, { scale: 1, duration: 0.25 }, at);
            }
          }
          beat(0.1);
          break;
        }
        case 'status':
        case 'burn':
          call(() => this.step(index));
          beat(event.type === 'status' ? 0.08 : 0.02);
          break;
        case 'trigger': {
          call(() => this.step(index));
          const slot = event.uid === null ? null : this.slotOf(after, event.uid);
          const glow = slot
            ? this.part(slot, 'glow')
            : this.root.querySelector(`[data-part="patron-${event.side}"]`);
          if (glow)
            tl.fromTo(glow, { opacity: 1 }, { opacity: 0, duration: 0.5, ease: 'power1.in' }, at);
          beat(0.16);
          break;
        }
        case 'summon': {
          call(() => this.step(index));
          const slot = { side: event.fighter.side, slot: event.fighter.slot };
          const from = reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5, y: -24 };
          tl.fromTo(
            this.part(slot, 'body'),
            from,
            {
              opacity: 1,
              scale: 1,
              y: 0,
              duration: 0.35,
              ease: reduced ? 'none' : 'back.out(1.6)',
            },
            at,
          );
          beat(0.32);
          break;
        }
        case 'death': {
          const slot = this.slotOf(before ?? after, event.uid);
          if (slot) {
            const body = this.part(slot, 'body');
            const to = reduced
              ? { opacity: 0, duration: 0.2 }
              : { opacity: 0, scale: 0.78, rotation: -6, filter: 'grayscale(1)', duration: 0.36 };
            tl.to(body, to, at);
            // The board drops the fighter once it has faded, and the slot's body is reset for
            // whatever is summoned into it next.
            call(() => this.step(index), at + to.duration);
            tl.set(body, { clearProps: 'all' }, at + to.duration + 0.01);
            beat(to.duration + 0.06);
          } else {
            call(() => this.step(index));
          }
          break;
        }
        case 'end':
          call(() => this.step(index), t + 0.2);
          beat(0.2);
          break;
      }
    });
  }

  /** A rising number over a slot. Three per slot, taken in turn, so a flurry does not overwrite. */
  private float(
    tl: Timeline,
    slot: SlotRef,
    text: string,
    color: string,
    at: number,
    size: number,
  ): void {
    const key = `${slot.side}-${slot.slot}`;
    const turn = ((this.floatTurn.get(key) ?? -1) + 1) % 3;
    this.floatTurn.set(key, turn);
    const label = this.root.querySelector<HTMLElement>(
      `[data-fx="${key}"] [data-part="float"][data-float="${turn}"]`,
    );
    if (!label) return;
    tl.call(
      () => {
        label.textContent = text;
        label.style.color = color;
      },
      [],
      at,
    );
    const rise = this.options.reduced ? 0 : -44;
    tl.fromTo(
      label,
      { opacity: 1, y: 0, scale: size * 1.15 },
      { opacity: 0, y: rise, scale: size, duration: 0.85, ease: 'power1.out' },
      at,
    );
  }

  private quake(tl: Timeline, at: number): void {
    const stage = this.root.querySelector('[data-part="stage"]');
    if (!stage) return;
    tl.fromTo(stage, { x: -7 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.4, 0.25)' }, at);
  }

  private slotOf(view: ReplayView | undefined, uid: number): SlotRef | null {
    const fighter = view?.fighters.get(uid);
    return fighter ? { side: fighter.side, slot: fighter.slot } : null;
  }

  private part(slot: SlotRef, part: string): Element | null {
    return this.root.querySelector(`[data-fx="${slot.side}-${slot.slot}"] [data-part="${part}"]`);
  }

  private parts(part: string): Element[] {
    return Array.from(this.root.querySelectorAll(`[data-part="${part}"]`));
  }

  /** How far to move `from` towards `to`, as a share of the distance between their centres. */
  private offset(from: SlotRef, to: SlotRef, share: number): { x: number; y: number } {
    const one = this.root
      .querySelector(`[data-fx="${from.side}-${from.slot}"]`)
      ?.getBoundingClientRect();
    const two = this.root
      .querySelector(`[data-fx="${to.side}-${to.slot}"]`)
      ?.getBoundingClientRect();
    if (!one || !two) return { x: 0, y: 0 };
    return {
      x: (two.left + two.width / 2 - (one.left + one.width / 2)) * share,
      y: (two.top + two.height / 2 - (one.top + one.height / 2)) * share,
    };
  }
}

interface SlotRef {
  side: number;
  slot: number;
}

function sign(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}
