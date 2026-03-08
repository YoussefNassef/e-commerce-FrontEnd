import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authorization = auth.authHeaderValue();
  const isAuthRoute = req.url.includes('/auth/');
  const isRefreshRoute = req.url.includes('/auth/refresh');

  const headers: Record<string, string> = {};

  if (authorization && !isRefreshRoute) {
    headers['Authorization'] = authorization;
  }

  // Required for ngrok free domains to bypass browser warning HTML page.
  if (req.url.includes('ngrok-free.dev')) {
    headers['ngrok-skip-browser-warning'] = '1';
  }

  const request =
    Object.keys(headers).length > 0
      ? req.clone({
          setHeaders: headers
        })
      : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthRoute || isRefreshRoute) {
        if (error.status === 403 && !isAuthRoute) {
          return throwError(() => error);
        }
        return throwError(() => error);
      }

      auth.logout();
      void router.navigateByUrl('/auth');
      return throwError(() => error);
    })
  );
};
