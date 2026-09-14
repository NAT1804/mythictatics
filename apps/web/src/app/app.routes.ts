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
        loadComponent: () => import('./pages/builder-page').then((m) => m.BuilderPage),
      },
      { path: '**', title: 'Page not found', component: NotFoundPage },
    ],
  },
];
