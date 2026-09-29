import type { BattleEvent, SideIndex, StatusCode } from '@mythictatics/shared/contracts';
import type { ReplayView } from '@mythictatics/shared/engine';

/**
 * The fight in words, one line per thing a player would say happened.
 *
 * Plain text by construction — every name comes off the catalog and is rendered with `{{ }}`,
 * never as markup. The log is what makes a battle legible at x4 and to a screen reader, so it
 * says who did what to whom and leaves the arithmetic to the board.
 */
export interface LogLine {
  /** Index of the event this line describes, so the page can show the log up to "now". */
  index: number;
  /**
   * Every event the line stands for. The same line in a row — Sif triggering six times off one
   * Baldur — is written once and counted, so a busy board still reads as a story.
   */
  indices: number[];
  side: SideIndex | null;
  text: string;
  tone: 'round' | 'attack' | 'death' | 'summon' | 'trigger' | 'end' | 'status';
}

export interface LogNames {
  /** A fighter's name as the board shows it: the god's for a descended slot. */
  fighter(uid: number, view: ReplayView): string;
  /** A card's name by id, for the card whose text fired. */
  card(id: string): string;
  status(code: StatusCode): string;
}

const LOGGED_STATUSES: ReadonlySet<StatusCode> = new Set([
  'safeguard',
  'taunt',
  'conceal',
  'reborn',
  'lethal',
  'vulnerable',
  'double_strike',
]);

export function battleLog(
  events: readonly BattleEvent[],
  views: readonly ReplayView[],
  names: LogNames,
): LogLine[] {
  const lines: LogLine[] = [];
  events.forEach((event, index) => {
    // A name is read off the board as it stood just before the event, so a fighter that this
    // event kills is still there to be named.
    const before = views[index - 1] ?? views[index];
    const sideOf = (uid: number) =>
      before.fighters.get(uid)?.side ?? views[index].fighters.get(uid)?.side ?? null;
    const name = (uid: number) =>
      names.fighter(uid, views[index].fighters.has(uid) ? views[index] : before);
    // Triggers and statuses fold into an earlier identical line back to the last thing that
    // happened (an attack, a death): a chain of Sif, Tyr, Sif, Tyr reads as "Sif ×2, Tyr ×2".
    const push = (side: SideIndex | null, text: string, tone: LogLine['tone']) => {
      const folds = tone === 'trigger' || tone === 'status';
      for (let at = lines.length - 1; at >= 0; at--) {
        const line = lines[at];
        if (line.text === text && line.side === side && line.tone === tone) {
          line.indices.push(index);
          return;
        }
        if (!folds || (line.tone !== 'trigger' && line.tone !== 'status')) break;
      }
      lines.push({ index, indices: [index], side, text, tone });
    };

    switch (event.type) {
      case 'round':
        push(null, `Round ${event.round}`, 'round');
        break;
      case 'attack':
        push(
          sideOf(event.uid),
          `${name(event.uid)} attacks ${name(event.target)}${event.strike > 1 ? ' again' : ''}`,
          'attack',
        );
        break;
      case 'death':
        push(sideOf(event.uid), `${name(event.uid)} is slain`, 'death');
        break;
      case 'summon':
        push(
          event.fighter.side,
          event.reborn
            ? `${name(event.fighter.uid)} is Reborn`
            : `${name(event.fighter.uid)} is summoned`,
          'summon',
        );
        break;
      case 'trigger':
        push(event.side, `${names.card(event.source)} triggers`, 'trigger');
        break;
      case 'status':
        if (!LOGGED_STATUSES.has(event.status)) break;
        push(
          sideOf(event.uid),
          `${name(event.uid)} ${event.on ? 'gains' : 'loses'} ${names.status(event.status)}`,
          'status',
        );
        break;
      case 'end':
        push(event.winner, endText(event), 'end');
        break;
    }
  });
  return lines;
}

export function endText(event: Extract<BattleEvent, { type: 'end' }>): string {
  if (event.winner === 0) return `Victory in ${event.rounds} ${plural(event.rounds, 'round')}`;
  if (event.winner === 1) return `Defeat in ${event.rounds} ${plural(event.rounds, 'round')}`;
  if (event.reason === 'rounds') return `Draw — the round limit ran out`;
  if (event.reason === 'stalemate') return `Draw — neither side can hurt the other`;
  if (event.reason === 'overflow') return `Draw — the fight spiralled out of control`;
  return 'Draw — both sides fell together';
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
