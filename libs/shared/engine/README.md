# shared-engine

The battle engine: two boards in, an event log out. Pure TypeScript with no framework and no I/O,
tagged `scope:shared`, so the same code referees a fight on a Worker and replays it in the
browser (`docs/game-v1-plan.md`, section 4).

```ts
import { createCardLookup, matchSetup, simulate } from '@mythictatics/shared/engine';

const result = simulate(matchSetup(seed, [mySide, theirSide]), createCardLookup(units, gods));
result.winner; // 0, 1 or null
result.events; // the whole fight, for a renderer to replay
```

## Determinism

A `MatchSetup` — `{ engineVersion, seed, sides }` — is the replay. Nothing in the engine reads a
clock or `Math.random`; the only chance is `Rng` (mulberry32) seeded from `seed`, and every list is
walked in slot order. `createCardLookup` sorts the cards by id itself, because "a random Babylon
unit" is a draw from a list and the list's order is part of the rules.

`determinism.spec.ts` pins one battle to `GOLDEN_HASH`; `apps/web-e2e/src/battle.spec.ts` fights
the same battle in a browser and expects the same hash. **Any change to how a battle resolves
changes that hash: update both, and bump `ENGINE_VERSION` in `rules.ts`.** A setup for another
engine version is refused rather than replayed wrongly.

## The rules, as implemented

These are the engine's decisions where the card text leaves room. Each is made once, in
`battle.ts`, and pinned by a test in `keywords.spec.ts` or `interactions.spec.ts`.

**Order of play.** The fuller board opens; a tie is the fight's first coin flip. Start of Battle
texts fire side by side (opener first), slot order within a side. Then rounds: the two sides
alternate turns, each walking its own board in slot order (front row left to right, then back).
A unit summoned mid-round acts from the next round. 30 rounds, or a round in which nobody is hurt,
is a draw.

**A turn.** A unit with Attack 0 or Cannot Attack skips its swing (it still counters). Burn ticks
at the end of every unit's turn, on both boards.

**An attack.** Target by the board's rule (`resolveTargetOn` in `shared/domain`): a Taunt in the
column, else the nearest Taunt, else the column front-to-back, else column scan. Concealed units
cannot be picked. Then, once per attack: the attacker's `Attack:` text → allies' "when an ally
attacks" → the target's "when this is attacked" and its allies' → the attacker loses Conceal. Then
the exchange; Double Strike runs the exchange twice, re-targeting if the first killed.

**The exchange** is simultaneous: both Attacks are read first, so a unit killed by the hit still
counters. Ranged on either side means no counter. The target's `Counter:` text fires before each
counter. Cleave also hits the units beside the target in its row; Pierce the unit behind or in
front of it. Splash uses the attacker's full Attack.

**Damage** (every hit, from any source, goes through `Battle.damage`, in this order):

1. A guardian (Frigga) takes it instead, except Burn.
2. **Safeguard** stops the hit whole and is removed. Nothing else in this list happens — so
   Safeguard stops Lethal without spending it, and a Vulnerable waits for the next hit.
3. **Vulnerable** doubles it, and is removed.
4. **Lethal** (any damage) or **Venomous** (attack, counter or splash) makes it a kill, and is
   spent: "the first unit it damages".
5. **Last Chance** leaves a killing hit — Lethal included — on 1 Health, once.

**Destroy** is not damage: nothing above stops it (Infesta, Sekhmet).

**Burn(X)** sets the longer of the unit's Burn and X turns. Each tick deals 1 plus its side's Burn
bonus (Grafigi, Prometheus, Ra) and counts down.

**Death**, in order: off the board → the killer's Slay (if it still stands) → **Reborn** brings a
copy back into the same slot on 1 Health with its printed Attack (its current Attack with Reborn
Keep Attack), without Reborn → the unit's own **Demise**, plus one echo per Mortissa → allies'
"after an ally is slain", enemies' "after an enemy is slain". So a Reborn unit's Demise summons
stand beside its copy, not in its slot.

**Summons** go to the preferred slot, else the nearest free one; a full board summons nothing.
Every summon — Reborn copies included — fires "whenever you summon an ally".

**Slay(X)** fires on every X-th kill.

## Card texts

`abilities/` holds one entry per card, by id, per realm; `gods.ts` holds the Descend texts and the
patron Powers that act in battle. The words stay in the dataset and the mechanic is here, so
re-theming a card is a data change and the id is the join (plan, section 5).

Cards whose text only acts between battles — Deploy, selling, End Turn, the Sanctum, Alchemy, the
hand — fight as their body alone and are listed in `abilities/no-battle-text.ts` with why.
`cards.spec.ts` fails if a unit is in neither list, so a new card cannot join battles silently.

Placeholders, until the economy exists (V2):

- A Celestial Medicine cast in battle is +T/+T for a Tier T Medicine (`MEDICINE_STATS_PER_TIER`).
- "Until next turn" lasts the whole battle; "this game" and "permanently" mean this battle.
- Tiamat's "Babylon allies deployed this game" counts the Babylon allies it fought beside.

## Renderers

`replayViews(events)` folds the log into one board per event. A renderer draws those and never
runs a rule, so swapping Angular DOM for PixiJS (plan, section 6) touches no logic.
`replay.spec.ts` checks the last view is exactly the engine's final board.

## AI opponents

`compOpponent` (a community comp, flexible slots filled from its realms) and `randomOpponent`
(three realms plus Neutral, Tier-weighted, a patron who descends onto the strongest unit) draw
from `opponentRng(seed)`, so a seed brings back the opponent as well as the fight.

Run `npx nx test shared-engine`.
