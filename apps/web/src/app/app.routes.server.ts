import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  // Board state lives in the `?d=` query string, so there is nothing to prerender.
  { path: 'builder', renderMode: RenderMode.Client },
  // Comps name cards by id; names and art come from the card data the browser fetches.
  { path: 'comps', renderMode: RenderMode.Client },
  { path: 'comps/:slug', renderMode: RenderMode.Client },
  // Every card comes from the card data the browser fetches, as in the builder.
  { path: 'collection', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server, status: 404 },
];
