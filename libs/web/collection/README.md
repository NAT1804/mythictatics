# web-collection

The Collection screen: `/collection` shows every patron god, unit and spell one realm at a time,
laid out like the game's own Collection screen — a realm bar across the top, Patron God / Units /
Spells along the bottom, and a funnel for search and Tier.

The realm and tab live in the query string (`/collection?realm=kami&tab=gods`), which is what the
home page's realm ring links to. Sanctum spells belong to no realm and are filed under Neutral.
Card data, art and the preview dialog come from `@mythictatics/web/builder`; the filtering is
`collectionCards` in `@mythictatics/shared/domain`.

Run `npx nx test web-collection` to execute the unit tests.
