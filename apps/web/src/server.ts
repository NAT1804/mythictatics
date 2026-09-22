import { AngularAppEngine, createRequestHandler } from '@angular/ssr';

/**
 * Fetch-based entry so the same bundle runs on Cloudflare Workers and the Angular dev server.
 * Prerendered pages and static files are served by Workers Static Assets before this runs;
 * the Worker only handles unknown URLs (the 404 page).
 */
const angularApp = new AngularAppEngine();

export const reqHandler = createRequestHandler(async (request) => {
  const response = await angularApp.handle(request);
  return response ?? new Response('Not found', { status: 404 });
});

export default { fetch: reqHandler };
