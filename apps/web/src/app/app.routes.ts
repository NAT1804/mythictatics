import { Route } from '@angular/router';
import { NotFoundPage, ShellLayout } from '@mythictatics/web/shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: ShellLayout,
    children: [
      { path: '', loadComponent: () => import('./pages/home-page').then((m) => m.HomePage) },
      {
        path: 'comps',
        title: 'Team Comps',
        loadComponent: () => import('@mythictatics/web/comps').then((m) => m.CompsPage),
      },
      {
        // The page sets the tab title itself once it knows the comp's name.
        path: 'comps/:slug',
        title: 'Team Comps',
        loadComponent: () => import('@mythictatics/web/comps').then((m) => m.CompPage),
      },
      {
        // Realm and tab are query parameters, bound straight onto the page's inputs.
        path: 'collection',
        title: 'Collection',
        loadComponent: () => import('@mythictatics/web/collection').then((m) => m.CollectionPage),
      },
      {
        path: 'builder',
        title: 'Team Builder',
        loadComponent: () => import('@mythictatics/web/builder').then((m) => m.BuilderPage),
      },
      { path: '**', title: 'Page not found', component: NotFoundPage },
    ],
  },
];
