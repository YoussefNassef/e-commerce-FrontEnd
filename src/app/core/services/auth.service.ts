import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { environment } from '../models/environment';
import { ApiUser, AuthSessionInfo } from '../models/api.models';

const LEGACY_TOKEN_KEY = 'store_token';
const LEGACY_USER_KEY = 'store_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = this.normalizeApiBase(environment.apiBaseUrl);

  private readonly tokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<ApiUser | null>(null);
  private readonly authCheckCompletedSignal = signal(false);

  private refreshRequest$: Observable<void> | null = null;
  private authBootstrap$: Observable<boolean> | null = null;

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.userSignal());
  readonly userName = computed(() => this.userSignal()?.fullName ?? '');
  readonly userPhone = computed(() => this.userSignal()?.phone ?? '');
  readonly authCheckInProgress = computed(() => !this.authCheckCompletedSignal());

  constructor() {
    this.cleanupLegacyTokenStorage();
    this.cleanupLegacyUserStorage();
  }

  register(payload: { fullName: string; phone: string }) {
    return this.http.post<{ message: string }>(`${this.api}/auth/register`, payload);
  }

  signIn(phone: string) {
    return this.http.post<{ message: string }>(`${this.api}/auth/signIn`, { phone });
  }

  verifyOtp(phone: string, code: string) {
    return this.http
      .post<Record<string, unknown>>(`${this.api}/auth/verify-otp`, { phone, code }, { withCredentials: true })
      .pipe(
        tap((response) => {
          const user = this.extractUser(response, phone);
          const token = this.tryExtractToken(response);
          this.setAccessToken(token);
          this.setSession(user);
        }),
        switchMap((response) =>
          this.refreshCurrentUser().pipe(
            map(() => response),
            catchError(() => of(response))
          )
        )
      );
  }

  verifyOtpCode(phone: string, code: string) {
    return this.http.post<Record<string, unknown>>(
      `${this.api}/auth/verify-otp`,
      {
        phone,
        code
      },
      { withCredentials: true }
    );
  }

  logout() {
    return this.http.post<unknown>(`${this.api}/auth/logout`, {}, { withCredentials: true }).pipe(
      map(() => void 0),
      catchError(() => of(void 0)),
      tap(() => this.clearAuthState())
    );
  }

  clearAuthState(): void {
    this.cleanupLegacyTokenStorage();
    this.cleanupLegacyUserStorage();
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.refreshRequest$ = null;
  }

  setAccessToken(token: string | null): void {
    if (!token || !token.trim()) {
      this.tokenSignal.set(null);
      return;
    }

    const normalized = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    this.tokenSignal.set(normalized);
  }

  ensureAuthReady(): Observable<boolean> {
    if (this.authCheckCompletedSignal()) {
      return of(true);
    }

    if (this.authBootstrap$) {
      return this.authBootstrap$;
    }

    const request$ = this.trySilentRefresh().pipe(
      map(() => true),
      catchError(() => of(true)),
      finalize(() => {
        this.authCheckCompletedSignal.set(true);
        this.authBootstrap$ = null;
      }),
      shareReplay(1)
    );

    this.authBootstrap$ = request$;
    return request$;
  }

  bootstrapSession() {
    return this.ensureAuthReady();
  }

  authHeaderValue(): string | null {
    const token = this.tokenSignal();
    if (!token || !token.trim()) {
      return null;
    }
    return `Bearer ${token}`;
  }

  updateLocalProfile(payload: { fullName: string; phone: string }): void {
    const current = this.userSignal();
    if (!current) {
      return;
    }

    const nextUser: ApiUser = {
      ...current,
      fullName: payload.fullName.trim() || current.fullName,
      phone: payload.phone.trim() || current.phone
    };

    this.userSignal.set(nextUser);
  }

  updateProfile(payload: { fullName: string; phone: string }) {
    return this.http
      .patch<unknown>(`${this.api}/users/me`, {
        fullName: payload.fullName.trim()
      })
      .pipe(
        map((response) => this.extractUserFromProfileResponse(response)),
        tap((user) => {
          if (user) {
            this.setSession(user);
          }
        })
      );
  }

  requestPhoneChange(phone: string) {
    return this.http.post<{ message?: string }>(`${this.api}/users/me/phone-change/request`, {
      phone: phone.trim()
    });
  }

  getSessions() {
    return this.http.get<AuthSessionInfo[]>(`${this.api}/auth/sessions`, { withCredentials: true });
  }

  revokeSession(sessionId: string) {
    return this.http.delete<{ success: boolean }>(`${this.api}/auth/sessions/${sessionId}`, { withCredentials: true });
  }

  logoutOtherSessions() {
    return this.http.post<{ success: boolean; revokedCount: number }>(
      `${this.api}/auth/sessions/logout-others`,
      {},
      { withCredentials: true }
    );
  }

  ensureCsrfCookie() {
    return this.http.get<{ csrfToken?: string }>(`${this.api}/auth/csrf`, { withCredentials: true });
  }

  verifyPhoneChange(payload: { phone: string; code: string }) {
    return this.http
      .post<unknown>(`${this.api}/users/me/phone-change/verify`, {
        phone: payload.phone.trim(),
        code: payload.code.trim()
      })
      .pipe(
        map((response) => this.extractUserFromProfileResponse(response)),
        tap((user) => {
          if (user) {
            this.setSession(user);
          }
        })
      );
  }

  refreshCurrentUser() {
    return this.http.get<unknown>(`${this.api}/users/me`, { withCredentials: true }).pipe(
      map((response) => this.extractUserFromProfileResponse(response)),
      tap((user) => {
        if (user) {
          this.setSession(user);
        }
      }),
      catchError(() => of(null))
    );
  }

  refreshAccessToken() {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    const request$ = this.requestRefreshToken(this.api)
      .pipe(
        map(() => void 0),
        catchError((err) => {
          const fallbackApi = this.resolveRefreshFallbackApi(err);
          if (!fallbackApi) {
            return throwError(() => err);
          }

          return this.requestRefreshToken(fallbackApi).pipe(
            map(() => void 0)
          );
        }),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay(1)
      );

    this.refreshRequest$ = request$;
    return request$;
  }

  private trySilentRefresh() {
    return this.refreshAccessToken().pipe(
      switchMap(() => this.refreshCurrentUser()),
      catchError(() => {
        this.clearAuthState();
        return of(null);
      })
    );
  }

  private requestRefreshToken(apiBase: string) {
    return this.http.post<Record<string, unknown>>(`${apiBase}/auth/refresh`, {}, { withCredentials: true }).pipe(
      tap((response) => {
        const token = this.tryExtractToken(response);
        if (token) {
          this.setAccessToken(token);
        }
      })
    );
  }

  private resolveRefreshFallbackApi(error: unknown): string | null {
    const err = error as { status?: unknown; error?: unknown } | null;
    if (err?.status !== 404) {
      return null;
    }

    const errorBody = this.asRecord(err.error);
    const message = typeof errorBody?.['message'] === 'string' ? errorBody['message'].toLowerCase() : '';
    const isMethodDowngrade = message.includes('cannot get') && message.includes('/api/auth/refresh');

    const isHttpNgrok = this.api.startsWith('http://') && this.api.includes('ngrok-free.dev');
    if (!isMethodDowngrade || !isHttpNgrok) {
      return null;
    }

    return this.api.replace(/^http:\/\//, 'https://');
  }

  private setSession(user: ApiUser): void {
    this.userSignal.set(user);
  }

  private extractToken(response: Record<string, unknown>): string {
    const data = this.asRecord(response['data']);
    const nestedData = this.asRecord(data?.['data']);

    const candidates: unknown[] = [
      response['accessToken'],
      response['token'],
      response['access_token'],
      response['jwt'],
      data?.['accessToken'],
      data?.['token'],
      data?.['access_token'],
      data?.['jwt'],
      nestedData?.['accessToken'],
      nestedData?.['token'],
      nestedData?.['access_token'],
      nestedData?.['jwt']
    ];

    const raw = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    const token = typeof raw === 'string' ? raw.trim() : '';
    const normalized = token.startsWith('Bearer ') ? token.slice(7).trim() : token;

    if (!normalized || normalized === 'undefined' || normalized === 'null') {
      throw new Error('Token is missing in auth response.');
    }

    return normalized;
  }

  private tryExtractToken(response: Record<string, unknown>): string | null {
    try {
      return this.extractToken(response);
    } catch {
      return null;
    }
  }

  private extractUser(response: Record<string, unknown>, phone: string): ApiUser {
    const data = this.asRecord(response['data']);
    const nestedData = this.asRecord(data?.['data']);

    const rawUser =
      response['user'] ??
      data?.['user'] ??
      data?.['profile'] ??
      data?.['account'] ??
      nestedData?.['user'] ??
      nestedData?.['profile'] ??
      nestedData?.['account'];

    if (rawUser && typeof rawUser === 'object') {
      const user = rawUser as Record<string, unknown>;
      const resolvedRole = this.resolveRole(
        user['role'] ??
          user['userRole'] ??
          user['type'] ??
          data?.['role'] ??
          data?.['userRole'] ??
          nestedData?.['role'] ??
          nestedData?.['userRole']
      );
      const idValue = user['id'];
      const fullNameValue = user['fullName'] ?? user['name'];
      const phoneValue = user['phone'] ?? user['mobile'];
      const isVerifiedValue = user['isVerified'] ?? user['verified'];
      return {
        id: typeof idValue === 'number' ? idValue : 0,
        fullName: typeof fullNameValue === 'string' && fullNameValue.trim() ? fullNameValue : 'User',
        phone: typeof phoneValue === 'string' && phoneValue.trim() ? phoneValue : phone,
        role: resolvedRole,
        isVerified: typeof isVerifiedValue === 'boolean' ? isVerifiedValue : true
      };
    }

    return {
      id: 0,
      fullName: 'User',
      phone,
      role: this.resolveRole(data?.['role'] ?? nestedData?.['role']),
      isVerified: true
    };
  }

  private resolveRole(rawRole: unknown): 'admin' | 'user' {
    if (this.isAdminRole(rawRole)) {
      return 'admin';
    }
    return 'user';
  }

  private isAdminRole(value: unknown): boolean {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      return normalized === 'admin' || normalized === 'super_admin' || normalized === 'superadmin';
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.isAdminRole(item));
    }

    return false;
  }

  private extractUserFromProfileResponse(response: unknown): ApiUser | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const record = response as Record<string, unknown>;
    const data = this.asRecord(record['data']);
    const nestedData = this.asRecord(data?.['data']);
    const source = nestedData ?? data ?? record;

    const fullName = source['fullName'] ?? source['name'];
    const phone = source['phone'] ?? source['mobile'];
    const id = source['id'];
    const isVerified = source['isVerified'] ?? source['verified'];
    const role = source['role'] ?? source['userRole'] ?? source['type'];

    return {
      id: typeof id === 'number' ? id : 0,
      fullName: typeof fullName === 'string' && fullName.trim() ? fullName : 'User',
      phone: typeof phone === 'string' && phone.trim() ? phone : '',
      isVerified: typeof isVerified === 'boolean' ? isVerified : true,
      role: this.resolveRole(role)
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private normalizeApiBase(apiBaseUrl: string): string {
    return apiBaseUrl.replace(/\/+$/, '');
  }

  private cleanupLegacyTokenStorage(): void {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  private cleanupLegacyUserStorage(): void {
    localStorage.removeItem(LEGACY_USER_KEY);
    sessionStorage.removeItem(LEGACY_USER_KEY);
  }
}
