import { PrerenderFallback, RenderMode, ServerRoute } from '@angular/ssr';
import type { Comp } from '@mythictatics/shared/contracts';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  // Board state lives in the `?d=` query string, which a prerendered page cannot see: the page is
  // its loading state, and the browser draws the board. Being static still keeps it off the Worker.
  { path: 'builder', renderMode: RenderMode.Prerender },
  // Drawn in full, cards and all; see `CatalogService.renderOnServer`.
  { path: 'comps', renderMode: RenderMode.Prerender },
  {
    path: 'comps/:slug',
    renderMode: RenderMode.Prerender,
    // Build time only, where a root-relative fetch is answered from the build's own assets.
    async getPrerenderParams() {
      const response = await fetch('/data/canonical/comps.json');
      if (!response.ok) throw new Error(`comps.json: ${response.status} ${response.statusText}`);
      const comps = (await response.json()) as Comp[];
      return comps.map(({ slug }) => ({ slug }));
    },
    // A slug the build did not know gets the page's "no comp by that name", drawn in the browser.
    fallback: PrerenderFallback.Client,
  },
  // Every card, filtered by the query string: prerendered as its loading state, like the builder.
  { path: 'collection', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
