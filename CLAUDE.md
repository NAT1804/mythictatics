<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Project notes

- Mythic Tatics: fan site for Mythic Tactics: Battleground. Angular 22 SSR on Cloudflare Workers; NestJS API planned under `apps/api`.
- Use `npx nx ...` (npm workspace, no pnpm).
- `libs/shared/*` (tag `scope:shared`) must stay framework-free so the planned api can reuse it.
- The SSR entry (`apps/web/src/server.ts`) is fetch-based with `ssr.platform: "neutral"`; do not add Express or Node-only APIs to it.
- Verify Worker behavior with `npx nx run web:cf-preview` / `npx nx e2e web-e2e`, not only `nx serve`. E2E needs `npm run e2e:install` once first, or Playwright fails with "Executable doesn't exist".
- Share codes (`?d=`) must stay byte-compatible with the Mythic Tactics Codex teambuilder. Anything the builder
  knows on top of a board and a patron god (realm picks, the descend slot) goes in its own query parameters —
  see `draft-code.ts`. Never append to `?d=`.

## Contracts (`libs/shared/contracts`)

- **Two entry points, on purpose.** `@mythictatics/shared/contracts` is types + plain constants and costs nothing at runtime — that is what browser code imports. `/schemas` is the zod behind them; import it only where something is actually validated (parsing `data/canonical/`, or a request body once the api exists).
- **Two layers of card, on purpose.** `Dataset*` mirrors `data/canonical/`: every locale the client ships, text still in the game's own markup. `Card` is what the site renders: one locale, markup already parsed. Only `@mythictatics/shared/domain` maps between them (`toCard`/`toKeyword`/`toRealm`) — nothing else should read `Dataset*`.
- **Nullable means the game has no answer, not "the data might be missing."** A Medicine has no `cost` because Alchemy grants it; a shared Sanctum spell has no `realm`. Everything else is required so a bad patch fails loudly at validation instead of reaching the site as an invented `0`. If dataset validation starts failing, fix the data or the extractor — do not loosen the schema.
- **Card text is `RichTextToken[]`, never an HTML string.** That is what keeps hostile markup out of the DOM, so it is a security boundary, not a style choice. `plainText(tokens)` in domain is the single place text becomes a string — do not add a second pre-flattened copy to the contract. `{0}` placeholders are deliberate (the game computes those numbers at runtime) and must survive parsing.
- Ids come from `lib/ids.ts` (`UnitIdSchema`/`GodIdSchema`/`SpellIdSchema`); cross-cutting primitives (`Slug`, `Tier`, `Rank`, `GameVersion`, `KeywordCode`) from `lib/primitives.ts`. Do not re-type the regexes at a use site.
- A card's realm is readable straight off its id — `REALM_NUMBERS` and `realmOfCardId`, checked by a test over every card. Units and realm spells need no lookup table; gods carry no realm number in their id.

## Dataset (`data/canonical/`)

- The project's one dataset: hand-maintained, committed, and the source for everything the site shows. Refresh after a game patch with `tools/client/extract_cards.py`.
- `meta.json` is the provenance record, and the note in it matters: `tier`, `cost`, `attack` and `health` are **not** in the shipped client — they were carried in by hand. Read it before trusting one of those numbers.
- `meta.json.excluded` lists cards the client's tables define that the game does not actually offer (`s_04007`). Re-extraction produces them again — drop them again.
- `realmLock` on a god is hand-maintained like `tier`/`cost` — the client says nothing about it. Eight gods have it
  (Ra, Tiamat, Zeus, Poseidon, Odin, Erlang Shen, Izanami, Samsin), read off the game's Patron God screen. It is not
  derivable from card text: Set names Niles twice and does not lock it. Re-extraction will not produce the field.
- Card and icon art under `apps/web/public/images/` is the only copy; the extraction output is not kept. The dataset tests hash every file against `imageSha256`, so art can never be swapped without updating the dataset.
- A god carries two more pictures beside its card: `power` (the Power's icon, 128×128, from `icon_power`) and
  `banner` (the tall standee, 156×348, from `icon_god_flag`). Both are `sprite`/`image`/`imageWidth`/`imageHeight`/
  `imageSha256` and both are hashed by the dataset tests. `extract_god_art` (see `GOD_ART`) does each in a pass of
  its own, bound to the god by the number in the sprite name (`icon_power_16`, `icon_god-flag_1601` → `champ016`), so neither can be
  mistaken for a second piece of card art. Unlike `tier`/`realmLock` they are fully in the client, so they are
  required, not nullable: re-extraction produces them, and a god without one is a broken extraction.
- **The two atlases do not cover the same gods.** On 1.6.0 `icon_power` has exactly the twenty-two the game offers;
  `icon_god_flag` has four more banners for gods with no card at all (`champ006`, `champ018`, `champ020`, `champ023`). A
  banner is never evidence that a god exists — the localization tables are. Re-extraction lists the four spares under
  `godArtWithoutGod` in `unresolved.json`; leave them out again.
- Since 1.6.0 a banner name ends in a two-digit look: `01` is the god's own banner, anything higher is a Patron God
  skin (`icon_god-flag_1102`, with card art `gods_card_character_11_02`). Skins are listed under `godSkins` in
  `unresolved.json` and are not in the dataset.
- The 1.6.0 source was the iOS app (`/Applications/Mythic Tactics.app` on an Apple silicon Mac), which
  `extract_cards.py` reads directly. It is built with Unity 6000.5 (serialized format 23), which UnityPy 1.25.3 cannot
  read; `tools/client/unity_compat.py` patches that in. Its art differs from the Android build's only by texture
  compression, so do not replace existing art on re-extraction unless the picture itself changed.
- Power choices (Amaterasu's Sun and Tsukuyomi's Moon spells, `s_063`–`s_074`) are in the spell tables but are not
  cards; they sit in `meta.json.excluded` next to `s_04007`.
- **The dataset tests live in `shared-domain`, not `shared-contracts`.** They validate all of `data/canonical/` against the contracts schemas and round-trip every card through `toCard`, so a contract change shows up there first — always run `npx nx test shared-domain` after touching a schema.

## Comps (`data/canonical/comps.json`)

- Imported from the community comp sheet with `python3 tools/comps/import_sheet.py` (stdlib only; pass a
  downloaded `.xlsx` path or let it fetch the sheet). It resolves every unit/god name against `cards.json` and
  exits non-zero on a name it cannot resolve — fix the sheet name or the script, do not hand-invent an id.
  Re-running is a no-op for comps that did not change (`updatedAt` only moves on a real change).
- A comp names cards by id only; names, art, realms and god Powers are read off the catalog at render time.
- A `null` board slot is a flexible pick ("Any" in the sheet). Xiaotian Quan is listed in the sheet but has no
  unit card (Erlang Shen's Power grants it), so it imports as a flexible slot — see `NOT_A_UNIT_CARD`.
- The sheet gives no Ranks, so every imported slot is Rank 1 (`rank: 0`).
- `howToPlay` is plain text, never Markdown/HTML — render it as text.
- The UI lives in `libs/web/comps` (`/comps`, `/comps/:slug`, prerendered with their data) and reuses the builder's
  `CatalogService`, `CardPreview` and card components exported from `@mythictatics/web/builder`.
- Only pages that call `CatalogService.renderOnServer()` get cards on the server; every other page is
  prerendered as its loading state. A page that does call it must draw its cards through the lookups
  (`unit`/`god`/`keyword`/`iconSrc`), never the lists (`units()`, `value()`): only the cards it looked up
  are sent to the browser, and the lists stay empty until the full catalog is in.

## PWA (`apps/web/ngsw-config.json`)

- Installable through `public/manifest.webmanifest`; offline through `@angular/service-worker`, registered in
  `app.config.ts` for production builds only. `Pwa` / `UpdateNotice` in `libs/web/shell` own the install button and
  the "new version" reload; nothing else should talk to `SwUpdate`.
- `index` is `/index.csr.html` and navigation is `freshness`: online, every page is still the prerendered HTML from
  the network; offline, the worker falls back to the CSR shell. Never add prerendered `*.html` to an asset group —
  it would pin pages to an old build.
- `data/canonical/*.json` is prefetched, so the builder, collection and comps work offline. Art (`/images/**`, 40MB)
  is cached lazily — never prefetch it. `ngsw.json` hashes file contents, so a dataset or art update reaches
  installed clients without renaming anything.
- `public/_headers` keeps `ngsw.json` and the worker scripts uncached on Workers Static Assets; keep it in step if
  the build starts emitting another worker file.
- Favicon, header logo and install icons are the Neutral realm mark, generated from `tools/brand/realm-neutral.png`
  (`icon-realm_neutral_m_high`, 256px, from the client's `icon-realm` atlas) with `node tools/brand/make-icons.mjs`.
  Commit the output; do not hand-edit it.
- Fonts are self-hosted from `@fontsource/*` (listed in `styles` in `project.json`), so they are part of the offline
  copy. Do not add Google Fonts or another third-party stylesheet back to `index.html`.
- A worker from a previous visit keeps serving the old build until it updates; when checking a change in a browser,
  use a fresh profile or DevTools → Application → "Update on reload".
