import type {
  BattleEvent,
  FighterSnapshot,
  SideIndex,
  StatusCode,
} from '@mythictatics/shared/contracts';
import { BOARD_SIZE } from '@mythictatics/shared/contracts';

/**
 * The board as a renderer shows it, at any point in the log.
 *
 * A renderer never runs the rules: it folds the log with `replayStep`, and whatever it draws is
 * the state the engine left. `replayViews` folds the whole log up front, which is what lets a
 * player skip to the end, or a timeline seek, without replaying anything — one view per event,
 * each sharing everything that did not change with the one before.
 */
export interface FighterView extends FighterSnapshot {
  /** Set by its `death` event; the view keeps a dead fighter so its last frame can be drawn. */
  dead: boolean;
}

export interface ReplayView {
  readonly fighters: ReadonlyMap<number, FighterView>;
  /** Which fighter stands in each slot, by uid; a slot empties when its fighter dies. */
  readonly boards: readonly [readonly (number | null)[], readonly (number | null)[]];
  readonly round: number;
  /** The fighter whose turn it is. */
  readonly active: number | null;
  readonly end: Extract<BattleEvent, { type: 'end' }> | null;
}

export const EMPTY_VIEW: ReplayView = {
  fighters: new Map(),
  boards: [emptyBoard(), emptyBoard()],
  round: 0,
  active: null,
  end: null,
};

export function replayStep(view: ReplayView, event: BattleEvent): ReplayView {
  switch (event.type) {
    case 'start': {
      const fighters = new Map<number, FighterView>();
      const boards: [(number | null)[], (number | null)[]] = [emptyBoard(), emptyBoard()];
      for (const fighter of event.fighters) {
        fighters.set(fighter.uid, { ...fighter, dead: false });
        boards[fighter.side][fighter.slot] = fighter.uid;
      }
      return { ...EMPTY_VIEW, fighters, boards };
    }
    case 'round':
      return { ...view, round: event.round, active: null };
    case 'turn':
      return { ...view, active: event.uid };
    case 'damage':
      return patch(view, event.uid, { health: event.health });
    case 'stats':
      return patch(view, event.uid, { attack: event.attack, health: event.health });
    case 'status': {
      const fighter = view.fighters.get(event.uid);
      if (!fighter) return view;
      const statuses: StatusCode[] = event.on
        ? [...fighter.statuses, event.status]
        : fighter.statuses.filter((status) => status !== event.status);
      return patch(view, event.uid, { statuses });
    }
    case 'burn':
      return patch(view, event.uid, { burn: event.turns });
    case 'summon': {
      const { fighter } = event;
      const fighters = new Map(view.fighters).set(fighter.uid, { ...fighter, dead: false });
      return {
        ...view,
        fighters,
        boards: place(view.boards, fighter.side, fighter.slot, fighter.uid),
      };
    }
    case 'death': {
      const fighter = view.fighters.get(event.uid);
      if (!fighter) return view;
      const next = patch(view, event.uid, { dead: true });
      const standing = view.boards[fighter.side][fighter.slot] === fighter.uid;
      return standing
        ? { ...next, boards: place(view.boards, fighter.side, fighter.slot, null) }
        : next;
    }
    case 'end':
      return { ...view, active: null, end: event };
    case 'attack':
    case 'trigger':
      return view;
  }
}

/** `views[i]` is the board once `events[i]` has happened. */
export function replayViews(events: readonly BattleEvent[]): ReplayView[] {
  const views: ReplayView[] = [];
  let view = EMPTY_VIEW;
  for (const event of events) {
    view = replayStep(view, event);
    views.push(view);
  }
  return views;
}

function patch(view: ReplayView, uid: number, changes: Partial<FighterView>): ReplayView {
  const fighter = view.fighters.get(uid);
  if (!fighter) return view;
  return { ...view, fighters: new Map(view.fighters).set(uid, { ...fighter, ...changes }) };
}

function place(
  boards: ReplayView['boards'],
  side: SideIndex,
  slot: number,
  uid: number | null,
): ReplayView['boards'] {
  const next: [(number | null)[], (number | null)[]] = [[...boards[0]], [...boards[1]]];
  next[side][slot] = uid;
  return next;
}

function emptyBoard(): (number | null)[] {
  return Array.from({ length: BOARD_SIZE }, () => null);
}
