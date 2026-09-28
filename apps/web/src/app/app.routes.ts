import { Route } from '@angular/router';
import {
  NotFoundPage,
  ShellLayout,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  type SeoRouteData,
} from '@mythictatics/web/shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: ShellLayout,
    children: [
      {
        path: '',
        data: {
          structuredData: {
            '@type': 'WebSite',
            name: SITE_NAME,
            url: `${SITE_URL}/`,
            description: `${SITE_TAGLINE}.`,
            inLanguage: 'en',
          },
        } satisfies SeoRouteData,
        loadComponent: () => import('./pages/home-page').then((m) => m.HomePage),
      },
      {
        path: 'comps',
        title: 'Team Comps',
        data: {
          description:
            'Community team comps for Mythic Tactics: Battleground — the ideal board, core units, patron gods and realms for each, with a guide on how to play it.',
        } satisfies SeoRouteData,
        loadComponent: () => import('@mythictatics/web/comps').then((m) => m.CompsPage),
      },
      {
        // The page sets its title and description itself once it knows the comp.
        path: 'comps/:slug',
        title: 'Team Comps',
        loadComponent: () => import('@mythictatics/web/comps').then((m) => m.CompPage),
      },
      {
        // Realm and tab are query parameters, bound straight onto the page's inputs.
        path: 'collection',
        title: 'Collection',
        data: {
          description:
            'Every patron god, unit and spell in Mythic Tactics: Battleground, by realm, with tiers, stats and full card text.',
        } satisfies SeoRouteData,
        loadComponent: () => import('@mythictatics/web/collection').then((m) => m.CollectionPage),
      },
      {
        path: 'builder',
        title: 'Team Builder',
        data: {
          description:
            'Plan a Mythic Tactics: Battleground board: pick a patron god and realms, drag units onto the grid, and share it as a Codex-compatible link.',
        } satisfies SeoRouteData,
        loadComponent: () => import('@mythictatics/web/builder').then((m) => m.BuilderPage),
      },
      {
        path: '**',
        title: 'Page not found',
        data: { noindex: true } satisfies SeoRouteData,
        component: NotFoundPage,
      },
    ],
  },
];
