import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureAuthReady().pipe(
    map(() => {
      if (!auth.isAuthenticated()) {
        return true;
      }

      const redirectUrl = route.queryParamMap.get('redirect')?.trim();
      return router.createUrlTree([redirectUrl || '/products']);
    })
  );
};
