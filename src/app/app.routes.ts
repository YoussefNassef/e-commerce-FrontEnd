import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';
import { checkoutAccessGuard } from './core/guards/checkout-access.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'products'
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth-page.component').then((m) => m.AuthPageComponent)
  },
  {
    path: 'products',
    loadComponent: () => import('./features/products/products-page.component').then((m) => m.ProductsPageComponent)
  },
  {
    path: 'products/:id',
    loadComponent: () =>
      import('./features/product-details/product-details-page.component').then((m) => m.ProductDetailsPageComponent)
  },
  {
    path: 'cart',
    canActivate: [authGuard],
    loadComponent: () => import('./features/cart/cart-page.component').then((m) => m.CartPageComponent)
  },
  {
    path: 'checkout',
    canActivate: [authGuard, checkoutAccessGuard],
    loadComponent: () => import('./features/checkout/checkout-page.component').then((m) => m.CheckoutPageComponent)
  },
  {
    path: 'addresses',
    canActivate: [authGuard],
    loadComponent: () => import('./features/addresses/addresses-page.component').then((m) => m.AddressesPageComponent)
  },
  {
    path: 'returns/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/returns-new-page.component').then((m) => m.ReturnsNewPageComponent)
  },
  {
    path: 'returns/my',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/returns-my-page.component').then((m) => m.ReturnsMyPageComponent)
  },
  {
    path: 'orders/:id/tracking',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/orders/order-tracking-page.component').then((m) => m.OrderTrackingPageComponent)
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/orders-page.component').then((m) => m.OrdersPageComponent)
  },
  {
    path: 'wishlist',
    canActivate: [authGuard],
    loadComponent: () => import('./features/wishlist/wishlist-page.component').then((m) => m.WishlistPageComponent)
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/notifications/notifications-page.component').then((m) => m.NotificationsPageComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin-dashboard-page.component').then((m) => m.AdminDashboardPageComponent)
  },
  {
    path: 'admin/overview',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/admin-overview-page.component').then((m) => m.AdminOverviewPageComponent)
  },
  {
    path: 'admin/catalog',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin-catalog/admin-catalog-page.component').then((m) => m.AdminCatalogPageComponent)
  },
  {
    path: 'admin/orders',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin-orders/admin-orders-page.component').then((m) => m.AdminOrdersPageComponent)
  },
  {
    path: 'admin/returns',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-returns-page.component').then((m) => m.AdminReturnsPageComponent)
  },
  {
    path: 'admin/coupons',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin-coupons/admin-coupons-page.component').then((m) => m.AdminCouponsPageComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page.component').then((m) => m.ProfilePageComponent)
  },
  {
    path: '**',
    redirectTo: 'products'
  }
];
