# web-battle

`/battle`: a board from the builder against the AI, fought by `@mythictatics/shared/engine` and
played back with GSAP.

- **The fight is over before anything moves.** `simulate` fights the whole battle, `replayViews`
  folds its log into one board per event, and `BattleDirector` only walks through those. Speed,
  pausing and skipping can never change a result.
- **The address is the replay.** The player's board is the builder's own `?d=`/`ds`; `vs`, `lv`
  and `seed` pick the opponent, its level and the dice (see `battle-match.ts`). The page writes a
  seed in when there is none, so every battle has a link that fights it again.
- **Tiles are the builder's `CardTile`,** handed the card with its `keywords` swapped for the
  fighter's live statuses — the frame's own Taunt shield, Safeguard aura and weapon marks follow
  the fight without a second card renderer.
- **GSAP only runs in the browser.** It is imported with `import('gsap')` from an
  `afterRenderEffect`, which never runs on the server, and the route is prerendered as its loading
  state. The server build still carries GSAP as a lazy chunk (the Angular builder emits every
  dynamic import for both platforms), but nothing on the Worker ever loads it.
- Respects `prefers-reduced-motion`: the same events, fades only.

Run `npx nx test web-battle`.
