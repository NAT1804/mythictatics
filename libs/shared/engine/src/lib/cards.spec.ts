import { NO_BATTLE_TEXT } from './abilities/no-battle-text';
import { DESCEND_ABILITIES, PATRON_POWERS, UNIT_ABILITIES } from './abilities';
import { compOpponent, opponentRng } from './opponents';
import { matchSetup, simulate } from './simulate';
import { datasetCards, fight, ofType, side, testUnit } from '../testing/fixtures';

/**
 * The registry against the dataset, and a golden per card mechanic that the keyword tests do not
 * already pin down.
 */

const { units, gods, comps, lookup } = datasetCards();
const base = { base: lookup };
const wall = testUnit(1, 0, 500);
const striker = testUnit(2, 5, 500);

describe('the registry', () => {
  it('gives every unit battle text or a reason it has none — never both, never neither', () => {
    for (const unit of units) {
      const listed = [UNIT_ABILITIES[unit.id], NO_BATTLE_TEXT[unit.id]].filter(Boolean);
      expect(listed, `${unit.id} ${unit.name}`).toHaveLength(1);
    }
  });

  it('names only cards the dataset has', () => {
    const unitIds = new Set(units.map((unit) => unit.id));
    const godIds = new Set(gods.map((god) => god.id));
    for (const id of [...Object.keys(UNIT_ABILITIES), ...Object.keys(NO_BATTLE_TEXT)]) {
      expect(unitIds.has(id), id).toBe(true);
    }
    for (const id of [...Object.keys(DESCEND_ABILITIES), ...Object.keys(PATRON_POWERS)]) {
      expect(godIds.has(id), id).toBe(true);
    }
  });

  it('fights every unit at every Rank without an error', () => {
    for (const unit of units) {
      for (const rank of [0, 1, 2] as const) {
        const result = fight(
          [
            side({ 0: { unit: unit.id, rank }, 4: { unit: 'm01001' } }),
            side({ 1: { unit: striker } }),
          ],
          { ...base, extra: [striker] },
        );
        expect(result.events.at(-1)?.type).toBe('end');
      }
    }
  });

  it('fights every descended god without an error', () => {
    for (const god of gods) {
      const result = fight(
        [
          side({ 0: { unit: 'm10002' }, 1: { unit: 'm01001' } }, god.id, 0),
          side({ 1: { unit: striker } }),
        ],
        { ...base, extra: [striker] },
      );
      expect(result.events.at(-1)?.type).toBe('end');
    }
  });

  it('fights every community comp against every other to an end, at every level', () => {
    for (const level of [0, 2] as const) {
      for (const one of comps) {
        for (const two of comps) {
          const seed = 42;
          const rng = opponentRng(seed);
          const result = simulate(
            matchSetup(seed, [
              compOpponent(one, lookup, level, rng),
              compOpponent(two, lookup, level, rng),
            ]),
            lookup,
          );
          expect(result.reason, `${one.slug} vs ${two.slug}`).not.toBe('overflow');
        }
      }
    }
  });
});

describe('card texts', () => {
  it('Niles Warrior summons its Mummies on Demise, by Rank', () => {
    const result = fight(
      [side({ 1: { unit: 'm01001', rank: 2 } }), side({ 1: { unit: striker } })],
      {
        ...base,
        extra: [striker],
      },
    );
    const mummies = ofType(result.events, 'summon').filter(
      (event) => event.fighter.unitId === 'm01002',
    );
    expect(mummies).toHaveLength(3);
  });

  it('Mortissa makes an ally Demise fire an extra time', () => {
    const result = fight(
      [side({ 1: { unit: 'm01001' }, 5: { unit: 'm10009' } }), side({ 1: { unit: striker } })],
      { ...base, extra: [striker] },
    );
    const firstDeath = result.events.findIndex((event) => event.type === 'death');
    const afterFirst = result.events.slice(firstDeath);
    const nextTurn = afterFirst.findIndex((event) => event.type === 'turn');
    const mummies = ofType(afterFirst.slice(0, nextTurn), 'summon');
    expect(mummies).toHaveLength(2);
  });

  it('Cat Archer fires the Demise of the ally in its column at Start of Battle', () => {
    const result = fight(
      [side({ 0: { unit: 'm01001' }, 3: { unit: 'm01007' } }), side({ 0: { unit: wall } })],
      {
        ...base,
        extra: [wall],
      },
    );
    const firstRound = result.events.findIndex((event) => event.type === 'round');
    const early = ofType(result.events.slice(0, firstRound), 'summon');
    expect(early.map((event) => event.fighter.unitId)).toEqual(['m01002']);
  });

  it('Frigga takes the hits meant for the ally in front of her', () => {
    const ally = testUnit(3, 0, 10);
    const result = fight(
      [side({ 0: { unit: ally }, 3: { unit: 'm03015' } }), side({ 0: { unit: striker } })],
      { ...base, extra: [striker, ally] },
    );
    const friggaUid = 2;
    const hits = ofType(result.events, 'damage').filter((event) => event.source === 3);
    expect(hits[0]).toMatchObject({ uid: friggaUid, blocked: true });
    expect(hits[1]).toMatchObject({ uid: friggaUid });
  });

  it('Artemis shoots the lowest Health enemy, wherever it stands', () => {
    const tough = testUnit(3, 0, 400);
    const frail = testUnit(4, 0, 3);
    const result = fight(
      [side({ 0: { unit: 'm02018' } }), side({ 0: { unit: tough }, 5: { unit: frail } })],
      { ...base, extra: [tough, frail] },
    );
    expect(ofType(result.events, 'attack')[0].target).toBe(3);
  });

  it('Medusa sets her target to 1/1 before she strikes', () => {
    const giant = testUnit(3, 0, 50);
    const result = fight([side({ 0: { unit: 'm02015', rank: 2 } }), side({ 0: { unit: giant } })], {
      ...base,
      extra: [giant],
    });
    expect(result.events).toContainEqual({ type: 'stats', uid: 2, attack: 1, health: 1 });
  });

  it('Grafigi adds to every Burn tick its side deals', () => {
    const result = fight(
      [side({ 0: { unit: 'm02016' }, 3: { unit: 'm02010' } }), side({ 0: { unit: wall } })],
      { ...base, extra: [wall] },
    );
    const ticks = ofType(result.events, 'damage').filter((event) => event.kind === 'burn');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((event) => event.amount === 3)).toBe(true);
  });

  it('Sekhmet destroys the allies summoned beside her, and brings them back on her Demise', () => {
    const result = fight(
      [
        side({ 1: { unit: 'm01001' }, 4: { unit: 'm01024' } }),
        side({ 1: { unit: testUnit(5, 50, 500) } }),
      ],
      { ...base, extra: [testUnit(5, 50, 500)] },
    );
    const sekhmet = ofType(result.events, 'trigger').filter((event) => event.source === 'm01024');
    expect(sekhmet.length).toBeGreaterThanOrEqual(2);
    const mummies = ofType(result.events, 'summon').filter(
      (event) => event.fighter.unitId === 'm01002',
    );
    // One from the Warrior's Demise, destroyed; one back from Sekhmet's.
    expect(mummies.length).toBeGreaterThanOrEqual(2);
  });

  it('Hachiman strikes once more for every other ally that has attacked', () => {
    const buddy = testUnit(3, 1, 500);
    const result = fight(
      [
        side({ 0: { unit: buddy }, 1: { unit: 'm06022' } }),
        side({ 0: { unit: wall }, 1: { unit: wall } }),
      ],
      { ...base, extra: [buddy, wall] },
    );
    const byHachiman = ofType(result.events, 'damage').filter(
      (event) => event.source === 2 && event.kind === 'effect',
    );
    // Round 1: the buddy has attacked once, so two hits of 8; round 2: three.
    expect(byHachiman.slice(0, 5).map((event) => event.amount)).toEqual([8, 8, 8, 8, 8]);
  });

  it('Gilgamesh adds to every stat gain', () => {
    // Griffin is Reborn, and Isis gives all allies +3/+3 when it comes back: Gilgamesh, beside
    // them, takes +5/+4 from that.
    const enemy = testUnit(6, 3, 500);
    const result = fight(
      [
        side({ 0: { unit: 'm05014' }, 1: { unit: 'm01017' }, 3: { unit: 'm01026' } }),
        side({ 1: { unit: enemy } }),
      ],
      { ...base, extra: [enemy] },
    );
    const gilgamesh = 1;
    const isis = result.events.findIndex(
      (event) => event.type === 'trigger' && event.source === 'm01026',
    );
    expect(isis).toBeGreaterThan(-1);
    const attackBefore =
      ofType(result.events.slice(0, isis), 'stats')
        .filter((event) => event.uid === gilgamesh)
        .at(-1)?.attack ?? 6;
    const gain = ofType(result.events.slice(isis), 'stats').find(
      (event) => event.uid === gilgamesh,
    );
    expect(gain!.attack - attackBefore).toBe(5);
  });
});

describe('patrons', () => {
  it('a descended god fights with its body added to the unit it stands on', () => {
    const ishtar = gods.find((god) => god.id === 'champ009')!;
    const result = fight(
      [side({ 0: { unit: 'm10002' } }, 'champ009', 0), side({ 0: { unit: wall } })],
      {
        ...base,
        extra: [wall],
      },
    );
    const start = ofType(result.events, 'start')[0].fighters[0];
    expect(start).toMatchObject({
      godId: 'champ009',
      attack: 10 + ishtar.attack,
      health: 10 + ishtar.health,
      statuses: ['safeguard'],
    });
  });

  it("Ra's Power gives every unit summoned in battle +1/+1 and Taunt, descended or not", () => {
    const result = fight(
      [side({ 1: { unit: 'm01001' } }, 'champ002'), side({ 1: { unit: striker } })],
      {
        ...base,
        extra: [striker],
      },
    );
    const mummy = ofType(result.events, 'summon').find(
      (event) => event.fighter.unitId === 'm01002',
    )!;
    const uid = mummy.fighter.uid;
    expect(result.events).toContainEqual({ type: 'stats', uid, attack: 2, health: 2 });
    expect(result.events).toContainEqual({ type: 'status', uid, status: 'taunt', on: true });
  });

  it('a patron that stayed a Power adds no body to the board', () => {
    const result = fight(
      [side({ 0: { unit: 'm10002' } }, 'champ009'), side({ 0: { unit: wall } })],
      {
        ...base,
        extra: [wall],
      },
    );
    expect(ofType(result.events, 'start')[0].fighters[0]).toMatchObject({
      godId: null,
      attack: 10,
    });
  });
});
