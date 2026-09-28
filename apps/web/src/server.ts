import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { crawlerResponse } from './crawl';

/**
 * Fetch-based entry so the same bundle runs on Cloudflare Workers and the Angular dev server.
 * Prerendered pages and static files are served by Workers Static Assets before this runs;
 * the Worker only handles unknown URLs (the 404 page) and the crawler files.
 */
const angularApp = new AngularAppEngine();

/** The static-assets binding declared in `wrangler.jsonc`. */
interface Env {
  ASSETS: { fetch(input: URL): Promise<Response> };
}

async function handle(request: Request, fetchAsset: (url: URL) => Promise<Response>) {
  const response =
    (await crawlerResponse(request, fetchAsset)) ?? (await angularApp.handle(request));
  return response ?? new Response('Not found', { status: 404 });
}

/** The dev server, which answers static files on the page's own origin. */
export const reqHandler = createRequestHandler((request) => handle(request, (url) => fetch(url)));

/** Workers, where a static file is read through the binding rather than a request to itself. */
export default {
  fetch: (request: Request, env: Env) => handle(request, (url) => env.ASSETS.fetch(url)),
};
