import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureAuthReady().pipe(
    map(() => {
      if (auth.isAuthenticated()) {
        return true;
      }

      return router.createUrlTree(['/auth'], {
        queryParams: {
          redirect: state.url,
          reason: 'session_expired'
        }
      });
    })
  );
};
