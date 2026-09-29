import { datasetCards, fight, ofType, side, testUnit } from '../testing/fixtures';

/**
 * The interaction matrix: where two keywords meet, which one wins. These are the pairs
 * `docs/game-v1-plan.md` (section 5) names as the ones bugs live in. Each is decided once, in
 * `Battle.damage` or `Battle.processDeath`, and pinned here so a change to that order is a
 * deliberate one — the rule is written out beside each test and in the engine's README.
 */

const base = { base: datasetCards().lookup };
const striker = testUnit(1, 5, 99);
const extra = [striker];

describe('Lethal / Venomous × Safeguard, Last Chance', () => {
  it('Safeguard stops a Lethal hit, and the Lethal is not spent on it', () => {
    const killer = testUnit(2, 1, 99);
    const guarded = testUnit(3, 0, 50);
    const result = fight(
      [
        side({ 0: { unit: killer, statuses: ['lethal'] } }),
        side({ 0: { unit: guarded, statuses: ['safeguard'] } }),
      ],
      { ...base, extra: [killer, guarded] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.uid === 2);
    expect(hits[0]).toMatchObject({ blocked: true, health: 50 });
    // The next hit is the Lethal one: Safeguard took the first, Lethal the second.
    expect(hits[1]).toMatchObject({ lethal: true, health: 0 });
  });

  it('Last Chance saves a unit from Lethal too, leaving it on 1', () => {
    const killer = testUnit(2, 1, 99);
    const lucky = testUnit(3, 0, 50);
    const result = fight(
      [
        side({ 0: { unit: killer, statuses: ['venomous'] } }),
        side({ 0: { unit: lucky, statuses: ['last_chance'] } }),
      ],
      { ...base, extra: [killer, lucky] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.uid === 2);
    expect(hits[0]).toMatchObject({ lethal: true, saved: true, health: 1 });
  });

  it('a Destroy is not damage: neither Safeguard nor Last Chance stops it', () => {
    // Infesta — Demise: Destroy the enemy that slew this.
    const guarded = testUnit(2, 5, 50);
    const result = fight(
      [
        side({ 0: { unit: 'm10014' } }),
        side({ 0: { unit: guarded, statuses: ['safeguard', 'last_chance'] } }),
      ],
      { ...base, extra: [guarded] },
    );
    const destroyed = ofType(result.events, 'damage').find(
      (event) => event.uid === 2 && event.lethal && event.health === 0,
    );
    expect(destroyed).toBeDefined();
    expect(result.winner).toBeNull();
  });
});

describe('Reborn × Demise', () => {
  it('comes back into its slot first, then its Demise fires — so its summons stand beside it', () => {
    // Niles Warrior — Demise: Summon 1 Mummy. Given Reborn here.
    const result = fight(
      [side({ 1: { unit: 'm01001', statuses: ['reborn'] } }), side({ 1: { unit: striker } })],
      { ...base, extra },
    );
    const firstDeath = result.events.findIndex((event) => event.type === 'death');
    const after = ofType(result.events.slice(firstDeath), 'summon');
    expect(after[0]).toMatchObject({ reborn: true, fighter: { unitId: 'm01001', slot: 1 } });
    expect(after[1]).toMatchObject({ reborn: false, fighter: { unitId: 'm01002' } });
    expect(after[1].fighter.slot).not.toBe(1);
  });

  it('a Reborn copy does not come back a second time', () => {
    const result = fight(
      [side({ 1: { unit: 'm01001', statuses: ['reborn'] } }), side({ 1: { unit: striker } })],
      { ...base, extra },
    );
    const warriors = ofType(result.events, 'summon').filter(
      (event) => event.fighter.unitId === 'm01001',
    );
    expect(warriors).toHaveLength(1);
  });
});

describe('Pierce / Cleave × Conceal', () => {
  it('Conceal only stops a unit being picked: a splash still lands on it', () => {
    const cleaver = testUnit(2, 3, 99);
    const bait = testUnit(3, 0, 99);
    const hidden = testUnit(4, 0, 99);
    const result = fight(
      [
        side({ 1: { unit: cleaver, statuses: ['cleave'] } }),
        side({ 1: { unit: bait }, 2: { unit: hidden, statuses: ['conceal'] } }),
      ],
      { ...base, extra: [cleaver, bait, hidden] },
    );
    const hiddenUid = 3;
    const splash = ofType(result.events, 'damage').find(
      (event) => event.uid === hiddenUid && event.kind === 'splash',
    );
    expect(splash).toBeDefined();
    // …and it was never the one attacked.
    expect(ofType(result.events, 'attack').every((event) => event.target !== hiddenUid)).toBe(true);
  });
});

describe('Burn × Last Chance', () => {
  it('a Burn tick that would kill is saved like any other damage', () => {
    // Hydra lights the target; the target has Last Chance and will not be hit by anything else.
    const lucky = testUnit(2, 0, 4);
    const result = fight(
      [side({ 0: { unit: 'm02016' } }), side({ 0: { unit: lucky, statuses: ['last_chance'] } })],
      { ...base, extra: [lucky] },
    );
    const saves = ofType(result.events, 'damage').filter((event) => event.uid === 2 && event.saved);
    expect(saves).toHaveLength(1);
  });
});

describe('Vulnerable × Safeguard', () => {
  it('Safeguard takes the hit first, and the Vulnerable waits for the next one', () => {
    const soft = testUnit(2, 0, 50);
    const result = fight(
      [
        side({ 0: { unit: striker } }),
        side({ 0: { unit: soft, statuses: ['safeguard', 'vulnerable'] } }),
      ],
      { ...base, extra: [striker, soft] },
    );
    const hits = ofType(result.events, 'damage').filter((event) => event.uid === 2);
    expect(hits[0]).toMatchObject({ blocked: true, amount: 5 });
    expect(hits[1]).toMatchObject({ amount: 10, health: 40 });
  });
});

describe('Double Strike × Counter', () => {
  it('each strike is its own exchange, and is countered', () => {
    const twin = testUnit(2, 1, 99);
    const wall = testUnit(3, 2, 99);
    const result = fight(
      [side({ 0: { unit: twin, statuses: ['double_strike'] } }), side({ 0: { unit: wall } })],
      { ...base, extra: [twin, wall] },
    );
    const twinUid = 1;
    const firstTurn = result.events.findIndex(
      (event) => event.type === 'turn' && event.uid === twinUid,
    );
    const nextTurn = result.events.findIndex(
      (event, index) => index > firstTurn && event.type === 'turn',
    );
    const counters = ofType(result.events.slice(firstTurn, nextTurn), 'damage').filter(
      (event) => event.kind === 'counter',
    );
    expect(counters).toHaveLength(2);
  });

  it('the "Counter:" text fires before every counter-attack', () => {
    // Chimera — Attack and Counter: Burn(3) all enemies on the target's column.
    const twin = testUnit(2, 1, 99);
    const result = fight(
      [side({ 0: { unit: twin, statuses: ['double_strike'] } }), side({ 0: { unit: 'm02012' } })],
      { ...base, extra: [twin] },
    );
    const firstTurn = result.events.findIndex((event) => event.type === 'turn' && event.uid === 1);
    const nextTurn = result.events.findIndex(
      (event, index) => index > firstTurn && event.type === 'turn',
    );
    const chimera = ofType(result.events.slice(firstTurn, nextTurn), 'trigger').filter(
      (event) => event.source === 'm02012',
    );
    expect(chimera).toHaveLength(2);
  });
});
