# Mythic Tatics

Unofficial fan site for **Mythic Tactics: Battleground**: team comps, a board builder and a
searchable codex. Angular SSR (hybrid rendering) deployed to Cloudflare Workers, in an Nx
monorepo that will later host a NestJS API.

## Requirements

- Node `^22.22.3 || ^24.15.0` (Angular 22)
- npm (lockfile is `package-lock.json`)

## Workspace layout

| Project            | Path                    | Tags                            | Purpose                                                     |
| ------------------ | ----------------------- | ------------------------------- | ----------------------------------------------------------- |
| `web`              | `apps/web`              | `scope:web` `type:app`          | Angular 22 SSR app, zoneless, Tailwind v4                   |
| `web-e2e`          | `apps/web-e2e`          | `scope:web` `type:e2e`          | Playwright, runs against the local Workers runtime          |
| `shared-contracts` | `libs/shared/contracts` | `scope:shared` `type:contracts` | Types + constants; zod validators under `/schemas`          |
| `shared-domain`    | `libs/shared/domain`    | `scope:shared` `type:domain`    | Game rules: realm draft, targeting, turn order, share codes |
| `web-shell`        | `libs/web/shell`        | `scope:web` `type:feature`      | Layout, title strategy, 404 page                            |

`scope:shared` libraries must not depend on Angular or `scope:web` code so the future
`apps/api` (NestJS) can reuse them — enforced by `@nx/enforce-module-boundaries`.

Import `@mythictatics/shared/contracts` for types and constants in browser code. Only import
`@mythictatics/shared/contracts/schemas` where runtime validation is needed (data pipeline,
API); it pulls in zod.

## Rendering

Configured in `apps/web/src/app/app.routes.server.ts`:

- `Prerender` — static HTML served straight from Workers Static Assets (free, no Worker call).
- `Client` — `/builder`, whose state lives in the `?d=` query string.
- `Server` — everything else (currently the 404 page), rendered by the Worker.

## Commands

```sh
npx nx serve web              # dev server on http://localhost:4200
npx nx run web:cf-preview     # production build on the local Workers runtime (:8787)
npx nx run-many -t lint typecheck test build
npx nx e2e web-e2e            # Playwright against cf-preview
npx nx graph                  # project graph
```

The same tasks are available as npm scripts:

| Script                 | Runs                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `npm start`            | `nx serve web`                                              |
| `npm run build`        | `nx build web`                                              |
| `npm run preview`      | `nx run web:cf-preview`                                     |
| `npm run deploy`       | `nx deploy web`                                             |
| `npm test`             | `nx run-many -t test`                                       |
| `npm run lint`         | `nx run-many -t lint`                                       |
| `npm run typecheck`    | `nx run-many -t typecheck`                                  |
| `npm run e2e`          | `nx e2e web-e2e` (run `npm run e2e:install` once first)     |
| `npm run format`       | `nx format:write`                                           |
| `npm run format:check` | `nx format:check`                                           |
| `npm run check`        | format check + `lint typecheck test build` on every project |
| `npm run affected`     | `lint typecheck test build` on affected projects only       |
| `npm run graph`        | `nx graph`                                                  |

## Deploying to Cloudflare

`apps/web/wrangler.jsonc` points the Worker at `dist/apps/web/server/server.mjs` and serves
`dist/apps/web/browser` as static assets. The SSR bundle is built with
`ssr.platform: "neutral"` so it runs on workerd rather than Node.

Manual deploy:

```sh
npx wrangler login
npx nx deploy web
```

CI deploy (`.github/workflows/ci.yml`, on push to `main`): add the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets and set the repository variable `CLOUDFLARE_DEPLOY=true`.

When the custom domain is attached, make sure it is listed in `security.allowedHosts` in
`apps/web/project.json`; Angular rejects SSR requests for unknown hosts.

## Disclaimer

Not affiliated with or endorsed by Hepxion. Game names and assets belong to their owners.
