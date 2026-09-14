import type { Board, BoardSlot, RealmCode } from '@mythictatics/shared/contracts';
import { columnScanOrder, createEmptyBoard, rowOf, turnOrder } from './board';
import { canPlaceUnit, draftedRealms, isRealmAllowed } from './realm-draft';
import { decodeShareCode, encodeShareCode } from './share-code';
import { resolveTarget, type TargetReason } from './targeting';

const unit = (unitId: string, rank: BoardSlot['rank'] = 0): BoardSlot => ({ unitId, rank });

/** Builds a board from a 6-char pattern: '.' empty, 'u' plain unit, 't' taunt unit. */
function boardFrom(pattern: string): Board {
  return [...pattern].map((char, index) =>
    char === '.' ? null : unit(`m${char === 't' ? '9' : '1'}000${index}`),
  );
}
const hasTaunt = (unitId: string) => unitId.startsWith('m9');

describe('board', () => {
  it('orders turns by occupied slot index', () => {
    const board = boardFrom('.u.uu.');
    expect([...turnOrder(board)]).toEqual([
      [1, 1],
      [3, 2],
      [4, 3],
    ]);
  });

  it('knows rows and the column scan order', () => {
    expect(rowOf(2)).toBe('front');
    expect(rowOf(3)).toBe('back');
    expect(columnScanOrder()).toEqual([0, 3, 1, 4, 2, 5]);
  });
});

describe('resolveTarget', () => {
  const cases: [attacker: number, enemy: string, index: number | null, reason?: TargetReason][] = [
    [0, 'uuuuuu', 0, 'front-in-column'],
    [4, 'uuuuuu', 1, 'front-in-column'],
    [1, 'u.uuuu', 4, 'back-in-column'],
    [1, 'u.uu.u', 0, 'fallback-scan'],
    [2, '...u..', 3, 'fallback-scan'],
    [0, 'uutuuu', 2, 'nearest-taunt'],
    [0, 'uu.utu', 4, 'nearest-taunt'],
    [2, 'tuuuut', 5, 'taunt-in-column'],
    [5, 'tt.tt.', 0, 'nearest-taunt'],
    [0, '......', null],
  ];

  it.each(cases)('attacker %i vs %s -> slot %s', (attacker, enemy, index, reason) => {
    const result = resolveTarget(attacker, boardFrom(enemy), hasTaunt);
    expect(result).toEqual(index === null ? null : { index, reason });
  });
});

describe('realm draft', () => {
  const realms: Record<string, RealmCode> = {
    m00001: 'babylon',
    m00002: 'kami',
    m00003: 'niles',
    m00004: 'olympus',
    m00005: 'neutral',
  };
  const realmOf = (id: string) => realms[id];
  const board: Board = [unit('m00001'), unit('m00002'), unit('m00003'), unit('m00005'), null, null];

  it('tracks non-neutral realms in placement order', () => {
    expect(draftedRealms(board, realmOf)).toEqual(['babylon', 'kami', 'niles']);
  });

  it('caps the draft at three realms but always allows neutral', () => {
    const drafted = draftedRealms(board, realmOf);
    expect(isRealmAllowed('olympus', drafted)).toBe(false);
    expect(isRealmAllowed('kami', drafted)).toBe(true);
    expect(isRealmAllowed('neutral', drafted)).toBe(true);
  });

  it('frees a realm when its only unit is replaced', () => {
    expect(canPlaceUnit(board, 4, 'm00004', realmOf)).toBe(false);
    expect(canPlaceUnit(board, 0, 'm00004', realmOf)).toBe(true);
    expect(canPlaceUnit(board, 4, 'm99999', realmOf)).toBe(false);
  });
});

describe('share code', () => {
  const build = {
    board: [unit('m05001', 2), null, null, null, null, unit('m12345', 1)],
    patronGodId: 'champ004',
  };
  // Generated independently from the Codex byte layout.
  const codexToken = 'ASEEiRMCOTAB';

  it('matches the Codex token format', () => {
    expect(encodeShareCode(build)).toBe(codexToken);
    expect(decodeShareCode(codexToken)).toEqual({ ok: true, build });
  });

  it('round-trips an empty build', () => {
    const empty = { board: createEmptyBoard(), patronGodId: null };
    expect(decodeShareCode(encodeShareCode(empty))).toEqual({ ok: true, build: empty });
  });

  it('drops unknown cards', () => {
    const result = decodeShareCode(codexToken, {
      isKnownUnit: (id) => id === 'm05001',
      isKnownGod: () => false,
    });
    expect(result).toEqual({
      ok: true,
      build: { board: [unit('m05001', 2), null, null, null, null, null], patronGodId: null },
    });
  });

  it('reports corrupted and unsupported tokens', () => {
    expect(decodeShareCode('!!')).toEqual({ ok: false, error: 'corrupted' });
    expect(decodeShareCode('ASEEiRM')).toEqual({ ok: false, error: 'corrupted' });
    expect(decodeShareCode('AgAA')).toEqual({ ok: false, error: 'unsupported-version' });
  });
});
