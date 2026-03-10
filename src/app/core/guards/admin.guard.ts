import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureAuthReady().pipe(
    map(() => {
      if (auth.user()?.role === 'admin') {
        return true;
      }

      return router.createUrlTree(['/products']);
    })
  );
};
