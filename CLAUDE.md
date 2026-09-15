<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

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
- Share codes (`?d=`) must stay byte-compatible with the Mythic Tactics Codex teambuilder.

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
- Card and icon art under `apps/web/public/images/` is the only copy; the extraction output is not kept. The dataset tests hash every file against `imageSha256`, so art can never be swapped without updating the dataset.
- **The dataset tests live in `shared-domain`, not `shared-contracts`.** They validate all of `data/canonical/` against the contracts schemas and round-trip every card through `toCard`, so a contract change shows up there first — always run `npx nx test shared-domain` after touching a schema.
