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
- `libs/shared/*` (tag `scope:shared`) must stay framework-free; browser code imports `@mythictatics/shared/contracts` (types/constants), never `/schemas` (zod) unless validation is needed.
- The SSR entry (`apps/web/src/server.ts`) is fetch-based with `ssr.platform: "neutral"`; do not add Express or Node-only APIs to it.
- Verify Worker behavior with `npx nx run web:cf-preview` / `npx nx e2e web-e2e`, not only `nx serve`.
- Share codes (`?d=`) must stay byte-compatible with the Mythic Tactics Codex teambuilder.
