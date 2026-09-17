# web-comps

The Team Comps screens: `/comps` lists every community comp, `/comps/:slug` shows one — its
conditions (realms, patron god, when to commit), ideal and alternative boards, how to play it, and
its core units, enablers and add-ons.

The data is `data/canonical/comps.json`, imported from the community comp sheet by
`tools/comps/import_sheet.py`. Card art, names and rules come from the builder's `CatalogService`.

Run `npx nx test web-comps` to execute the unit tests.
