# shared-contracts

The shapes every other library and app agrees on. No framework, no I/O — types and zod schemas
only, so the Angular app on Cloudflare Workers and the planned NestJS api can both depend on it.

## Two entry points, on purpose

| Import                                   | Holds                              | Costs              |
| ---------------------------------------- | ---------------------------------- | ------------------ |
| `@mythictatics/shared/contracts`         | Types and plain constants          | Nothing at runtime |
| `@mythictatics/shared/contracts/schemas` | The zod schemas behind those types | Pulls zod in       |

Browser code imports the first. Reach for `/schemas` only where something actually has to be
validated — parsing `data/canonical/`, or a request body once the api exists.

## Two layers of card, on purpose

`Dataset*` is the shape of `data/canonical/`, kept source-shaped: every locale the game client
ships, and text still in the game's own rich-text markup. `Card` is what the site renders — one
locale, chosen; markup already parsed into `RichTextToken`s, never HTML.

Mapping between them is a separate, tested step in `@mythictatics/shared/domain` (`toCard`,
`toKeyword`, `toRealm`). Nothing else should read `Dataset*`.

## Where the nullables are, and why

A field is nullable here only where the game itself has no answer: a Medicine has no `cost`
because Alchemy grants it rather than selling it, and a shared Sanctum spell has no `realm`.
Everything else is required, so a patch that drops a field fails the dataset tests loudly instead
of reaching the site as an invented `0`. `data/canonical/meta.json` records which fields came out
of the client and which did not — read it before trusting a number.

## Running unit tests

Run `nx test shared-contracts` to execute the unit tests via [Vitest](https://vitest.dev/). The
schemas are also exercised against the real dataset by `nx test shared-domain`.
