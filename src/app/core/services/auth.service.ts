import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../models/environment';
import { ApiUser } from '../models/api.models';

const TOKEN_KEY = 'store_token';
const REFRESH_TOKEN_KEY = 'store_refresh_token';
const USER_KEY = 'store_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  private readonly tokenSignal = signal<string | null>(this.readStoredToken());
  private readonly refreshTokenSignal = signal<string | null>(this.readStoredRefreshToken());
  private readonly userSignal = signal<ApiUser | null>(this.readStoredUser());
  private refreshRequest$: Observable<string | null> | null = null;

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());
  readonly userName = computed(() => this.userSignal()?.fullName ?? '');
  readonly userPhone = computed(() => this.userSignal()?.phone ?? '');

  register(payload: { fullName: string; phone: string }) {
    return this.http.post<{ message: string }>(`${this.api}/auth/register`, payload);
  }

  signIn(phone: string) {
    return this.http.post<{ message: string }>(`${this.api}/auth/signIn`, { phone });
  }

  verifyOtp(phone: string, code: string) {
    return this.http
      .post<Record<string, unknown>>(`${this.api}/auth/verify-otp`, { phone, code })
      .pipe(
        tap((response) => {
          const token = this.extractToken(response);
          const refreshToken = this.extractRefreshToken(response);
          const user = this.extractUser(response, phone, token);
          this.setSession(token, user, refreshToken);
          this.refreshCurrentUser().subscribe();
        })
      );
  }

  verifyOtpCode(phone: string, code: string) {
    return this.http.post<Record<string, unknown>>(`${this.api}/auth/verify-otp`, {
      phone,
      code
    });
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.userSignal.set(null);
  }

  bootstrapSession() {
    return this.refreshCurrentUser();
  }

  authHeaderValue(): string | null {
    const token = this.tokenSignal();
    return token ? `Bearer ${token}` : null;
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

    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
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
            this.setSession(this.tokenSignal() ?? '', user);
          }
        })
      );
  }

  requestPhoneChange(phone: string) {
    return this.http.post<{ message?: string }>(`${this.api}/users/me/phone-change/request`, {
      phone: phone.trim()
    });
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
            this.setSession(this.tokenSignal() ?? '', user);
          }
        })
      );
  }

  refreshCurrentUser() {
    if (!this.tokenSignal()) {
      return of(null);
    }

    return this.http.get<unknown>(`${this.api}/users/me`).pipe(
      map((response) => this.extractUserFromProfileResponse(response)),
      tap((user) => {
        if (user) {
          this.setSession(this.tokenSignal() ?? '', user);
        }
      }),
      catchError(() => of(null))
    );
  }

  refreshAccessToken() {
    if (!this.refreshTokenSignal()) {
      return of(null);
    }

    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    const request$ = this.http
      .post<Record<string, unknown>>(`${this.api}/auth/refresh`, {
        refreshToken: this.refreshTokenSignal()
      })
      .pipe(
      map((response) => {
        const token = this.extractToken(response);
        const refreshToken = this.extractRefreshToken(response) ?? this.refreshTokenSignal();
        const fallbackPhone = this.userSignal()?.phone ?? '';
        const user = this.extractUser(response, fallbackPhone, token);
        this.setSession(token, user, refreshToken);
        return token;
      }),
      catchError((err) => {
        this.logout();
        return throwError(() => err);
      }),
      finalize(() => {
        this.refreshRequest$ = null;
      }),
      shareReplay(1)
    );

    this.refreshRequest$ = request$;
    return request$;
  }

  private setSession(token: string, user: ApiUser, refreshToken?: string | null): void {
    localStorage.setItem(TOKEN_KEY, token);
    const nextRefreshToken = refreshToken?.trim() ?? this.refreshTokenSignal();
    if (nextRefreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
      this.refreshTokenSignal.set(nextRefreshToken);
    }
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.tokenSignal.set(token);
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
      throw new Error('Token is missing in verify-otp response.');
    }

    return normalized;
  }

  private extractRefreshToken(response: Record<string, unknown>): string | null {
    const data = this.asRecord(response['data']);
    const nestedData = this.asRecord(data?.['data']);

    const candidates: unknown[] = [
      response['refreshToken'],
      response['refresh_token'],
      data?.['refreshToken'],
      data?.['refresh_token'],
      nestedData?.['refreshToken'],
      nestedData?.['refresh_token']
    ];

    const raw = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof raw === 'string' ? raw.trim() : null;
  }

  private extractUser(response: Record<string, unknown>, phone: string, token: string): ApiUser {
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
          nestedData?.['userRole'],
        token
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

    // Some backends return only token in verify endpoint.
    return {
      id: 0,
      fullName: 'User',
      phone,
      role: this.resolveRole(data?.['role'] ?? nestedData?.['role'], token),
      isVerified: true
    };
  }

  private resolveRole(rawRole: unknown, token: string): 'admin' | 'user' {
    if (this.isAdminRole(rawRole)) {
      return 'admin';
    }

    const tokenPayload = this.decodeJwtPayload(token);
    if (!tokenPayload) {
      return 'user';
    }

    const roleCandidates: unknown[] = [
      tokenPayload['role'],
      tokenPayload['userRole'],
      tokenPayload['type'],
      tokenPayload['roles']
    ];

    return roleCandidates.some((value) => this.isAdminRole(value)) ? 'admin' : 'user';
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

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    try {
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
      const json = atob(padded);
      const parsed = JSON.parse(json);
      return this.asRecord(parsed);
    } catch {
      return null;
    }
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
    const token = this.tokenSignal() ?? '';

    return {
      id: typeof id === 'number' ? id : 0,
      fullName: typeof fullName === 'string' && fullName.trim() ? fullName : 'User',
      phone: typeof phone === 'string' && phone.trim() ? phone : '',
      isVerified: typeof isVerified === 'boolean' ? isVerified : true,
      role: this.resolveRole(role, token)
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private readStoredToken(): string | null {
    const token = localStorage.getItem(TOKEN_KEY)?.trim() ?? '';

    if (!token || token === 'undefined' || token === 'null') {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    return token.startsWith('Bearer ') ? token.slice(7).trim() : token;
  }

  private readStoredRefreshToken(): string | null {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)?.trim() ?? '';
    if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      return null;
    }
    return refreshToken;
  }

  private readStoredUser(): ApiUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ApiUser>;
      const normalizedRole = typeof parsed.role === 'string' && parsed.role.toLowerCase().trim() === 'admin' ? 'admin' : 'user';
      return {
        id: typeof parsed.id === 'number' ? parsed.id : 0,
        fullName: typeof parsed.fullName === 'string' ? parsed.fullName : 'User',
        phone: typeof parsed.phone === 'string' ? parsed.phone : '',
        role: normalizedRole,
        isVerified: typeof parsed.isVerified === 'boolean' ? parsed.isVerified : true
      };
    } catch {
      return null;
    }
  }

}
