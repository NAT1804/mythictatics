import { datasetCards, fight, ofType, side, testUnit } from '../testing/fixtures';

/**
 * One keyword at a time, on blank test units, so each golden reads as the rule it pins down.
 * The cards' own texts are covered in `cards.spec.ts`; keywords meeting each other in
 * `interactions.spec.ts`.
 */

const base = { base: datasetCards().lookup };

describe('the exchange', () => {
  it('trades blows simultaneously: a hit that kills is still struck back', () => {
    const a = testUnit(1, 3, 5);
    const b = testUnit(2, 5, 3);
    const result = fight([side({ 0: { unit: a } }), side({ 0: { unit: b } })], {
      ...base,
      extra: [a, b],
    });
    const damage = ofType(result.events, 'damage');
    expect(damage.slice(0, 2).map((event) => event.kind)).toEqual(['attack', 'counter']);
    // 3 into 3 Health and 5 into 5: whoever opens, both die in the one exchange.
    expect(result).toMatchObject({ winner: null, reason: 'wipe', survivors: [[], []] });
  });

  it('ends with the side still standing as the winner, its Tiers as the damage', () => {
    const big = testUnit(1, 10, 10);
    const small = testUnit(2, 1, 1);
    const result = fight([side({ 0: { unit: big } }), side({ 0: { unit: small } })], {
      ...base,
      extra: [big, small],
    });
    expect(result).toMatchObject({ winner: 0, damage: 1 });
    expect(result.survivors[0][0].health).toBe(9);
  });

  it('opens with the fuller board', () => {
    const unit = testUnit(1, 1, 50);
    const result = fight([side({ 0: { unit } }), side({ 0: { unit }, 1: { unit } })], {
      ...base,
      extra: [unit],
    });
    expect(ofType(result.events, 'start')[0].first).toBe(1);
  });

  it('alternates turns between the sides, each in slot order', () => {
    const unit = testUnit(1, 1, 50);
    const result = fight([side({ 0: { unit }, 4: { unit } }), side({ 1: { unit }, 2: { unit } })], {
      ...base,
      extra: [unit],
      seed: 11,
    });
    const first = ofType(result.events, 'start')[0].first;
    const turns = ofType(result.events, 'turn')
      .slice(0, 4)
      .map((event) => event.uid);
    // Side 0 is uids 1 (slot 0) and 2 (slot 4); side 1 is 3 (slot 1) and 4 (slot 2).
    expect(turns).toEqual(first === 0 ? [1, 3, 2, 4] : [3, 1, 4, 2]);
  });
});

describe('targeting', () => {
  const striker = testUnit(1, 1, 99);
  const wall = testUnit(2, 0, 99);

  function firstTarget(enemy: ReturnType<typeof side>, attackerSlot: number): number {
    const result = fight([side({ [attackerSlot]: { unit: striker } }), enemy], {
      ...base,
      extra: [striker, wall],
    });
    const start = ofType(result.events, 'start')[0];
    const attack = ofType(result.events, 'attack').find((event) => event.uid === 1)!;
    return start.fighters.find((fighter) => fighter.uid === attack.target)!.slot;
  }

  it('hits the unit in its own column, front before back', () => {
    expect(firstTarget(side({ 1: { unit: wall }, 4: { unit: wall } }), 1)).toBe(1);
    expect(firstTarget(side({ 4: { unit: wall }, 0: { unit: wall } }), 1)).toBe(4);
  });

  it('falls back to the first unit in column scan order', () => {
    expect(firstTarget(side({ 5: { unit: wall }, 4: { unit: wall } }), 0)).toBe(4);
  });

  it('must hit a Taunt first, one in its own column before the nearest', () => {
    const board = side({
      0: { unit: wall },
      2: { unit: wall, statuses: ['taunt'] },
      4: { unit: wall, statuses: ['taunt'] },
    });
    expect(firstTarget(board, 0)).toBe(4);
    expect(firstTarget(board, 2)).toBe(2);
  });

  it('cannot pick a Concealed unit until it gives itself away by attacking', () => {
    const hidden = testUnit(3, 1, 99);
    const result = fight(
      [
        side({ 0: { unit: striker }, 2: { unit: striker } }),
        side({ 0: { unit: hidden, statuses: ['conceal'] }, 1: { unit: wall } }),
      ],
      { ...base, extra: [striker, wall, hidden] },
    );
    const hiddenUid = 3;
    const revealedAt = result.events.findIndex(
      (event) => event.type === 'status' && event.uid === hiddenUid && !event.on,
    );
    expect(revealedAt).toBeGreaterThan(-1);
    const attacksBefore = ofType(result.events.slice(0, revealedAt), 'attack');
    expect(attacksBefore.length).toBeGreaterThan(0);
    expect(attacksBefore.every((event) => event.target !== hiddenUid)).toBe(true);
  });
});

describe('combat keywords', () => {
  it('Ranged is never countered, and never counters', () => {
    const archer = testUnit(1, 2, 5);
    const brute = testUnit(2, 3, 20);
    const result = fight(
      [side({ 0: { unit: archer, statuses: ['ranged'] } }), side({ 0: { unit: brute } })],
      { ...base, extra: [archer, brute] },
    );
    expect(ofType(result.events, 'damage').some((event) => event.kind === 'counter')).toBe(false);
  });

  it('Cannot Attack takes no swing but still counters', () => {
    const wall = testUnit(1, 4, 50);
    const striker = testUnit(2, 1, 10);
    const result = fight(
      [side({ 0: { unit: wall, statuses: ['cannot_attack'] } }), side({ 0: { unit: striker } })],
      { ...base, extra: [wall, striker] },
    );
    const byWall = ofType(result.events, 'damage').filter((event) => event.source === 1);
    expect(byWall.length).toBeGreaterThan(0);
    expect(byWall.every((event) => event.kind === 'counter')).toBe(true);
    expect(result.winner).toBe(0);
  });

  it('Double Strike attacks twice, the second strike finding a new target', () => {
    const striker = testUnit(1, 5, 50);
    const weak = testUnit(2, 0, 5);
    const result = fight(
      [
        side({ 0: { unit: striker, statuses: ['double_strike'] } }),
        side({ 0: { unit: weak }, 1: { unit: weak } }),
      ],
      { ...base, extra: [striker, weak] },
    );
    const opening = ofType(result.events, 'attack').filter((event) => event.uid === 1);
    expect(opening.slice(0, 2).map((event) => event.strike)).toEqual([1, 2]);
    expect(opening[0].target).not.toBe(opening[1].target);
  });

  it('Cleave also hits the units beside the target; Pierce the one behind it', () => {
    const striker = testUnit(1, 3, 50);
    const target = testUnit(2, 0, 10);
    // uids 2, 3, 4 across the front row, 5 behind slot 0.
    const enemy = side({
      0: { unit: target },
      1: { unit: target },
      2: { unit: target },
      3: { unit: target },
    });
    const cleave = fight([side({ 1: { unit: striker, statuses: ['cleave'] } }), enemy], {
      ...base,
      extra: [striker, target],
    });
    const splashed = ofType(cleave.events, 'damage').filter((event) => event.kind === 'splash');
    expect(splashed.slice(0, 2).map((event) => event.uid)).toEqual([2, 4]);

    const pierce = fight([side({ 0: { unit: striker, statuses: ['pierce'] } }), enemy], {
      ...base,
      extra: [striker, target],
    });
    const pierced = ofType(pierce.events, 'damage').filter((event) => event.kind === 'splash');
    expect(pierced[0].uid).toBe(5);
  });

  it('Lethal destroys the first unit it damages, and is then spent', () => {
    const scorpion = testUnit(1, 1, 99);
    const giant = testUnit(2, 0, 100);
    const result = fight(
      [
        side({ 0: { unit: scorpion, statuses: ['lethal'] } }),
        side({ 0: { unit: giant }, 1: { unit: giant } }),
      ],
      { ...base, extra: [scorpion, giant] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.source === 1);
    expect(hits[0]).toMatchObject({ lethal: true, health: 0 });
    expect(hits[1].lethal).toBeUndefined();
    expect(result.events).toContainEqual({ type: 'status', uid: 1, status: 'lethal', on: false });
  });

  it('Venomous kills with an attack', () => {
    const snake = testUnit(1, 1, 99);
    const giant = testUnit(2, 0, 100);
    const result = fight(
      [side({ 0: { unit: snake, statuses: ['venomous'] } }), side({ 0: { unit: giant } })],
      { ...base, extra: [snake, giant] },
    );
    expect(ofType(result.events, 'damage')[0]).toMatchObject({ kind: 'attack', lethal: true });
  });

  it('Safeguard stops one hit whole, and is then gone', () => {
    const striker = testUnit(1, 5, 99);
    const guarded = testUnit(2, 0, 6);
    const result = fight(
      [side({ 0: { unit: striker } }), side({ 0: { unit: guarded, statuses: ['safeguard'] } })],
      { ...base, extra: [striker, guarded] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.uid === 2);
    expect(hits[0]).toMatchObject({ blocked: true, health: 6 });
    expect(hits[1]).toMatchObject({ health: 1 });
  });

  it('Vulnerable doubles the next hit only', () => {
    const striker = testUnit(1, 3, 99);
    const soft = testUnit(2, 0, 20);
    const result = fight(
      [side({ 0: { unit: striker } }), side({ 0: { unit: soft, statuses: ['vulnerable'] } })],
      { ...base, extra: [striker, soft] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.uid === 2);
    expect(hits.slice(0, 2).map((event) => event.amount)).toEqual([6, 3]);
  });

  it('Last Chance leaves a killing hit on 1 Health, once', () => {
    const striker = testUnit(1, 50, 99);
    const lucky = testUnit(2, 0, 5);
    const result = fight(
      [side({ 0: { unit: striker } }), side({ 0: { unit: lucky, statuses: ['last_chance'] } })],
      { ...base, extra: [striker, lucky] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.uid === 2);
    expect(hits[0]).toMatchObject({ saved: true, health: 1 });
    expect(hits[1].health).toBeLessThanOrEqual(0);
  });

  it('Reborn comes back once, into its own slot, on 1 Health with its printed Attack', () => {
    const phoenix = testUnit(1, 2, 3);
    const striker = testUnit(2, 5, 99);
    const result = fight(
      [
        side({ 0: { unit: phoenix, attack: 7, statuses: ['reborn'] } }),
        side({ 0: { unit: striker } }),
      ],
      { ...base, extra: [phoenix, striker] },
    );
    const summons = ofType(result.events, 'summon');
    expect(summons).toHaveLength(1);
    expect(summons[0]).toMatchObject({
      reborn: true,
      fighter: { slot: 0, attack: 2, health: 1, statuses: [] },
    });
  });

  it('Reborn Keep Attack comes back with the Attack it had', () => {
    const phoenix = testUnit(1, 2, 3);
    const striker = testUnit(2, 5, 99);
    const result = fight(
      [
        side({ 0: { unit: phoenix, attack: 7, statuses: ['reborn', 'reborn_keep_attack'] } }),
        side({ 0: { unit: striker } }),
      ],
      { ...base, extra: [phoenix, striker] },
    );
    expect(ofType(result.events, 'summon')[0].fighter.attack).toBe(7);
  });
});

describe('Burn', () => {
  it('deals 1 whenever any unit ends its turn, and burns out after its turns', () => {
    // Hydra — Attack: Burn(3) the target and all enemies next to it.
    const wall = testUnit(1, 0, 60);
    const result = fight([side({ 0: { unit: 'm02016' } }), side({ 0: { unit: wall } })], {
      ...base,
      extra: [wall],
    });
    const wallUid = 2;
    const burns = ofType(result.events, 'burn').filter((event) => event.uid === wallUid);
    // Lit at 3, ticks at the end of Hydra's turn and the wall's, re-lit on Hydra's next attack.
    expect(burns.slice(0, 4).map((event) => event.turns)).toEqual([3, 2, 1, 3]);
    const ticks = ofType(result.events, 'damage').filter((event) => event.kind === 'burn');
    expect(ticks.every((event) => event.amount === 1 && event.source === null)).toBe(true);
  });
});

describe('how a battle ends', () => {
  it('calls a fight nobody can win a stalemate', () => {
    const wall = testUnit(1, 0, 10);
    const result = fight([side({ 0: { unit: wall } }), side({ 0: { unit: wall } })], {
      ...base,
      extra: [wall],
    });
    expect(result).toMatchObject({ winner: null, reason: 'stalemate', damage: 0 });
  });

  it('calls it at the round limit', () => {
    const tank = testUnit(1, 1, 1000);
    const result = fight([side({ 0: { unit: tank } }), side({ 0: { unit: tank } })], {
      ...base,
      extra: [tank],
    });
    expect(result).toMatchObject({ winner: null, reason: 'rounds', rounds: 30 });
  });

  it('always ends with an end event', () => {
    const tank = testUnit(1, 1, 1000);
    const result = fight([side({ 0: { unit: tank } }), side({ 0: { unit: tank } })], {
      ...base,
      extra: [tank],
    });
    expect(result.events.at(-1)).toEqual({
      type: 'end',
      winner: null,
      rounds: 30,
      reason: 'rounds',
    });
  });
});
