import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CheckoutAccessService } from '../services/checkout-access.service';

const PENDING_ORDER_STORAGE_KEY = 'checkout_pending_order_id';

export const checkoutAccessGuard: CanActivateFn = (route) => {
  const checkoutAccess = inject(CheckoutAccessService);
  const router = inject(Router);

  if (checkoutAccess.consume()) {
    return true;
  }

  const orderId = route.queryParamMap.get('orderId') ?? route.queryParamMap.get('order_id');
  if (orderId) {
    return true;
  }

  const pendingOrderId = localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
  if (pendingOrderId) {
    return true;
  }

  return router.parseUrl('/products');
};
