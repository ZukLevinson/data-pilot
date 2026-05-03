import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'products',
    pathMatch: 'full',
  },
  {
    path: 'products',
    loadChildren: () =>
      import('@org/portal/feature-products').then((m) => m.featureProductsRoutes),
  },
  {
    path: 'products',
    loadChildren: () =>
      import('@org/portal/feature-product-detail').then(
        (m) => m.featureProductDetailRoutes,
      ),
  },
  {
    path: '**',
    redirectTo: 'products',
  },
];
