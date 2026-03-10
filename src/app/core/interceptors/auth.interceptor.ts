import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../models/environment';
import { AuthService } from '../services/auth.service';

const RETRY_MARKER_HEADER = 'x-auth-refresh-retried';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const apiBaseUrl = environment.apiBaseUrl;

  const isApiRequest = req.url.startsWith(apiBaseUrl);
  if (!isApiRequest) {
    return next(req);
  }

  const isRefreshRoute = req.url.includes('/auth/refresh');

  const requestHeaders: Record<string, string> = {};
  const isUnsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
  const csrfToken = isUnsafeMethod ? readCookie('csrf_token') : null;
  if (csrfToken) {
    requestHeaders['X-CSRF-Token'] = csrfToken;
  }

  if (req.url.includes('ngrok-free.dev')) {
    requestHeaders['ngrok-skip-browser-warning'] = '1';
  }

  const request = req.clone({
    withCredentials: true,
    ...(Object.keys(requestHeaders).length > 0 ? { setHeaders: requestHeaders } : {})
  });

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      if (isRefreshRoute || request.headers.has(RETRY_MARKER_HEADER)) {
        auth.clearAuthState();
        void router.navigate(['/auth'], { queryParams: { reason: 'session_expired' } });
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap(() => {
          const retryRequest = request.clone({
            setHeaders: {
              [RETRY_MARKER_HEADER]: '1'
            }
          });
          return next(retryRequest);
        }),
        catchError((refreshError) => {
          auth.clearAuthState();
          void router.navigate(['/auth'], { queryParams: { reason: 'session_expired' } });
          return throwError(() => refreshError);
        })
      );
    })
  );
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey !== name) {
      continue;
    }
    return decodeURIComponent(rawValue.join('='));
  }

  return null;
}
