import { Route } from '@angular/router';
import { NotFoundPage, ShellLayout } from '@mythictatics/web/shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: ShellLayout,
    children: [
      { path: '', loadComponent: () => import('./pages/home-page').then((m) => m.HomePage) },
      {
        path: 'builder',
        title: 'Team Builder',
        // The builder pins itself to the viewport and scrolls only its unit list, so the shell
        // must not put it inside a scrolling page.
        data: { layout: 'fixed' },
        loadComponent: () => import('@mythictatics/web/builder').then((m) => m.BuilderPage),
      },
      { path: '**', title: 'Page not found', component: NotFoundPage },
    ],
  },
];
