import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatasetCard, God, RealmCode, Unit } from '@mythictatics/shared/contracts';
import { toCard } from './dataset';
import { canDescendOnto, descendPreview } from './descend';
import { decodeDraftParams, encodeDraftParams } from './draft-code';
import {
  EMPTY_DRAFT,
  type RealmDraft,
  canPickRealm,
  draftRealms,
  isDraftComplete,
  isUnitDraftable,
  lockedRealmOf,
  remainingPicks,
  toggleRealm,
  withPatron,
} from './draft';
import { createEmptyBoard } from './board';

const CANONICAL = join(import.meta.dirname, '../../../../../data/canonical');
const cards: DatasetCard[] = JSON.parse(readFileSync(join(CANONICAL, 'cards.json'), 'utf8'));
const card = (id: string) => toCard(cards.find((entry) => entry.id === id)!);
const god = (id: string) => card(id) as God;
const unit = (id: string) => card(id) as Unit;

/** Ra locks Niles; Horus and Set, the other two Niles gods, do not. */
const RA = god('champ002');
const HORUS = god('champ001');

describe('realm lock', () => {
  it('is carried through from the dataset onto the card', () => {
    expect(RA.realmLock).toBe(true);
    expect(HORUS.realmLock).toBe(false);
    // Set's Power names Niles twice and still does not lock it, which is why the flag is data
    // rather than something read out of the card.
    expect(god('champ003').realmLock).toBe(false);
  });

  it('is held by exactly the five gods the dataset marks', () => {
    const locked = cards
      .filter((entry) => entry.kind === 'god')
      .map((entry) => toCard(entry) as God)
      .filter((entry) => entry.realmLock)
      .map((entry) => entry.id);
    expect(locked).toEqual([
      'champ002', // Ra, Niles
      'champ008', // Tiamat, Babylon
      'champ011', // Zeus, Olympus
      'champ012', // Poseidon, Olympus
      'champ015', // Odin, Yggdrasil
      'champ016', // Erlang Shen, Shenzhou
      'champ019', // Izanami, Kami
      'champ028', // Samsin, Daehan
    ]);
  });

  it('is what decides whether a god spends one of the three realms', () => {
    expect(lockedRealmOf(RA)).toBe('niles');
    expect(lockedRealmOf(HORUS)).toBeNull();
    expect(lockedRealmOf(null)).toBeNull();
    // The builder's own switch, for laying out a board the game would not deal.
    expect(lockedRealmOf(RA, false)).toBeNull();
  });
});

describe('the realm draft', () => {
  it('leaves three picks for a god without a lock, and two for one with', () => {
    expect(remainingPicks(withPatron(EMPTY_DRAFT, HORUS))).toBe(3);
    expect(remainingPicks(withPatron(EMPTY_DRAFT, RA))).toBe(2);
    expect(draftRealms(withPatron(EMPTY_DRAFT, RA))).toEqual(['niles']);
  });

  it('fills up at three realms and refuses a fourth', () => {
    let draft = withPatron(EMPTY_DRAFT, HORUS);
    for (const realm of ['kami', 'olympus', 'daehan'] as const) draft = toggleRealm(draft, realm);
    expect(isDraftComplete(draft)).toBe(true);
    expect(canPickRealm(draft, 'babylon')).toBe(false);
    expect(draftRealms(toggleRealm(draft, 'babylon'))).toEqual(['kami', 'olympus', 'daehan']);
  });

  it('never spends a pick on Neutral, which is always available', () => {
    const draft = toggleRealm(withPatron(EMPTY_DRAFT, HORUS), 'neutral');
    expect(draft.picked).toEqual([]);
    expect(canPickRealm(draft, 'neutral')).toBe(false);
    // m10001 is Neutral, so it is buyable with nothing drafted at all.
    expect(isUnitDraftable(unit('m10001'), EMPTY_DRAFT)).toBe(true);
  });

  it('lets a pick be taken back but not the god’s locked realm', () => {
    const draft = toggleRealm(withPatron(EMPTY_DRAFT, RA), 'kami');
    expect(draftRealms(toggleRealm(draft, 'kami'))).toEqual(['niles']);
    expect(draftRealms(toggleRealm(draft, 'niles'))).toEqual(['niles', 'kami']);
  });

  it('keeps the picks that still fit when the patron changes', () => {
    const pick = (draft: RealmDraft, ...realms: RealmCode[]) =>
      realms.reduce((next, realm) => toggleRealm(next, realm), draft);
    const free = withPatron(EMPTY_DRAFT, HORUS);

    // Set locks Niles, so a draft that had already picked it loses nothing: the pick simply
    // becomes the god's.
    expect(draftRealms(withPatron(pick(free, 'niles', 'kami', 'olympus'), RA))).toEqual([
      'niles',
      'kami',
      'olympus',
    ]);
    // Without Niles among the picks there is no room for all three, and the newest goes.
    expect(draftRealms(withPatron(pick(free, 'kami', 'olympus', 'daehan'), RA))).toEqual([
      'niles',
      'kami',
      'olympus',
    ]);
  });

  it('only offers units from a drafted realm', () => {
    const draft = withPatron(EMPTY_DRAFT, RA);
    expect(isUnitDraftable(unit('m01001'), draft)).toBe(true);
    expect(isUnitDraftable(unit('m05001'), draft)).toBe(false);
  });
});

describe('descend', () => {
  it('only lands on a slot that holds a unit', () => {
    const board = createEmptyBoard();
    expect(canDescendOnto(board, 0)).toBe(false);
    board[2] = { unitId: 'm01001', rank: 0 };
    expect(canDescendOnto(board, 2)).toBe(true);
    expect(canDescendOnto(board, 9)).toBe(false);
  });

  it('adds the god’s body to the base unit, and says where each half came from', () => {
    const base = unit('m05001');
    const preview = descendPreview(RA, base, 1);
    expect([preview.baseAttack, preview.baseHealth]).toEqual([6, 4]);
    expect(preview.attack).toBe(6 + RA.attack);
    expect(preview.health).toBe(4 + RA.health);
  });

  it('falls back to the top Rank the unit actually has', () => {
    const base = unit('m05001');
    expect(descendPreview(RA, base, 2).baseAttack).toBe(base.ranks.at(-1)!.attack);
  });
});

describe('the draft query parameters', () => {
  it('leaves out everything still at its default so a plain ?d= link stays plain', () => {
    expect(encodeDraftParams({ realms: [], lockEnabled: true, descendSlot: null })).toEqual({
      r: null,
      lock: null,
      ds: null,
    });
  });

  it('writes the same link for the same draft, whatever order it was picked in', () => {
    const one = encodeDraftParams({
      realms: ['kami', 'babylon'],
      lockEnabled: true,
      descendSlot: 3,
    });
    const other = encodeDraftParams({
      realms: ['babylon', 'kami'],
      lockEnabled: true,
      descendSlot: 3,
    });
    expect(one).toEqual(other);
    expect(one['r']).toBe('babylon-kami');
  });

  it('round-trips a released lock and a descend slot', () => {
    const params = { realms: ['niles'] as const, lockEnabled: false, descendSlot: 0 };
    const encoded = encodeDraftParams(params);
    expect(decodeDraftParams(encoded as Record<string, string>)).toEqual(params);
  });

  it('drops what it cannot read rather than failing the link', () => {
    expect(decodeDraftParams({ r: 'kami-atlantis-kami', ds: '-2' })).toEqual({
      realms: ['kami'],
      lockEnabled: true,
      descendSlot: null,
    });
    expect(decodeDraftParams({})).toEqual({ realms: [], lockEnabled: true, descendSlot: null });
  });
});
