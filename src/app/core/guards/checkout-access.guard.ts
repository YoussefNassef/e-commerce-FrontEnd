import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CheckoutAccessService } from '../services/checkout-access.service';

export const checkoutAccessGuard: CanActivateFn = () => {
  const checkoutAccess = inject(CheckoutAccessService);
  const router = inject(Router);

  if (checkoutAccess.consume()) {
    return true;
  }

  return router.parseUrl('/products');
};

