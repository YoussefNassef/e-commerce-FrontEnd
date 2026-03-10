import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../models/environment';
import { PaymentResult } from '../models/api.models';

export interface CreatePaymentPayload {
  orderId: string;
  name: string;
  number: string;
  month: number;
  year: number;
  cvc: string;
}

export interface CreatePaymentOptions {
  headers?: Record<string, string>;
  forceNewAttempt?: boolean;
}

export interface PaymentReconcileSummary {
  scanned: number;
  paid: number;
  failed: number;
  unchanged: number;
  errors: number;
}

interface StoredPaymentAttempt {
  attemptId: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private static readonly attemptsStorageKey = 'payment_attempts_v1';

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;
  private readonly inFlightByOrder = new Map<string, Observable<PaymentResult>>();

  createPayment(payload: CreatePaymentPayload, options: CreatePaymentOptions = {}): Observable<PaymentResult> {
    const orderId = payload.orderId.trim();
    const attemptKey = options.forceNewAttempt ? this.startNewAttempt(orderId) : this.getOrCreateAttemptKey(orderId);

    if (!options.forceNewAttempt) {
      const existingInFlight = this.inFlightByOrder.get(orderId);
      if (existingInFlight) {
        return existingInFlight;
      }
    }

    const headers: Record<string, string> = {
      ...(options.headers ?? {}),
      'idempotency-key': attemptKey,
      'x-idempotency-key': attemptKey
    };

    const request$ = this.http
      .post<unknown>(`${this.api}/payments/moyasar`, payload, { headers })
      .pipe(
        map((response) => this.normalizePaymentResponse(response)),
        catchError((error) => {
          if (error?.status !== 404) {
            return throwError(() => error);
          }

          return this.http
            .post<unknown>(`${this.api}/payments/create`, payload, { headers })
            .pipe(map((response) => this.normalizePaymentResponse(response)));
        }),
        tap((result) => {
          if (result.status === 'paid') {
            this.clearPaymentAttemptKey(orderId);
          }
        }),
        finalize(() => {
          this.inFlightByOrder.delete(orderId);
        }),
        shareReplay(1)
      );

    this.inFlightByOrder.set(orderId, request$);
    return request$;
  }

  syncPayment(paymentId: string) {
    return this.http
      .get<unknown>(`${this.api}/payments/sync`, {
        params: {
          id: paymentId
        }
      })
      .pipe(map((response) => this.normalizePaymentResponse(response)));
  }

  reconcilePayments() {
    return this.http.post<unknown>(`${this.api}/payments/reconcile`, {}).pipe(map((response) => this.normalizeReconcileSummary(response)));
  }

  getOrCreateAttemptKey(orderId: string): string {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      return '';
    }

    const store = this.readAttemptsStore();
    const existing = store[normalizedOrderId];
    if (existing?.attemptId) {
      return this.composeAttemptKey(normalizedOrderId, existing.attemptId);
    }

    const attemptId = this.generateAttemptId();
    store[normalizedOrderId] = { attemptId };
    this.writeAttemptsStore(store);
    return this.composeAttemptKey(normalizedOrderId, attemptId);
  }

  startNewAttempt(orderId: string): string {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      return '';
    }

    const store = this.readAttemptsStore();
    const attemptId = this.generateAttemptId();
    store[normalizedOrderId] = { attemptId };
    this.writeAttemptsStore(store);
    return this.composeAttemptKey(normalizedOrderId, attemptId);
  }

  clearPaymentAttemptKey(orderId: string): void {
    const normalizedOrderId = orderId.trim();
    if (!normalizedOrderId) {
      return;
    }

    const store = this.readAttemptsStore();
    delete store[normalizedOrderId];
    this.writeAttemptsStore(store);
    this.inFlightByOrder.delete(normalizedOrderId);
  }

  handleOrderStatusChange(orderId: string, status: string): void {
    const normalized = status.toLowerCase().trim();
    if (normalized === 'paid' || normalized === 'completed' || normalized === 'cancelled') {
      this.clearPaymentAttemptKey(orderId);
    }
  }

  private normalizeReconcileSummary(response: unknown): PaymentReconcileSummary {
    const base = this.toRecord(response) ?? {};
    const data = this.toRecord(base['data']);
    const nested = this.toRecord(data?.['data']);
    const source = nested ?? data ?? base;

    return {
      scanned: this.toNumber(source['scanned']),
      paid: this.toNumber(source['paid']),
      failed: this.toNumber(source['failed']),
      unchanged: this.toNumber(source['unchanged']),
      errors: this.toNumber(source['errors'])
    };
  }

  private normalizePaymentResponse(response: unknown): PaymentResult {
    const base = this.toRecord(response);
    const data = this.toRecord(base?.['data']);
    const nestedData = this.toRecord(data?.['data']);

    const redirectUrl =
      this.findFirstUrl(base) ??
      this.findFirstUrl(data) ??
      this.findFirstUrl(nestedData) ??
      this.readUrlFields(base) ??
      this.readUrlFields(data) ??
      this.readUrlFields(nestedData);

    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      const normalizedStatus = this.normalizeStatus(
        record['status'] ?? data?.['status'] ?? nestedData?.['status'] ?? record['paymentStatus']
      );
      const message =
        this.pickString(record['message']) ?? this.pickString(data?.['message']) ?? this.pickString(nestedData?.['message']);

      if (record['data'] && typeof record['data'] === 'object') {
        return {
          ...(record['data'] as PaymentResult),
          status: normalizedStatus ?? (record['data'] as PaymentResult).status,
          message: message ?? (record['data'] as PaymentResult).message,
          redirectUrl: redirectUrl ?? (record['data'] as PaymentResult).redirectUrl
        };
      }

      return {
        ...(record as unknown as PaymentResult),
        status: normalizedStatus ?? (record as unknown as PaymentResult).status,
        message: message ?? (record as unknown as PaymentResult).message,
        redirectUrl: redirectUrl ?? (record as unknown as PaymentResult).redirectUrl
      };
    }

    return {};
  }

  private normalizeStatus(raw: unknown): PaymentResult['status'] | undefined {
    if (typeof raw !== 'string') {
      return undefined;
    }
    const normalized = raw.toLowerCase().trim();
    if (normalized.includes('paid') || normalized.includes('success')) {
      return 'paid';
    }
    if (normalized.includes('fail') || normalized.includes('declined')) {
      return 'failed';
    }
    if (normalized.includes('init') || normalized.includes('pending') || normalized.includes('process')) {
      return 'initiated';
    }
    return undefined;
  }

  private readAttemptsStore(): Record<string, StoredPaymentAttempt> {
    const sessionRaw = sessionStorage.getItem(PaymentsService.attemptsStorageKey);
    if (sessionRaw) {
      try {
        const parsed = JSON.parse(sessionRaw) as Record<string, StoredPaymentAttempt>;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    const raw = localStorage.getItem(PaymentsService.attemptsStorageKey);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, StoredPaymentAttempt>;
      const normalized = parsed && typeof parsed === 'object' ? parsed : {};
      sessionStorage.setItem(PaymentsService.attemptsStorageKey, JSON.stringify(normalized));
      localStorage.removeItem(PaymentsService.attemptsStorageKey);
      return normalized;
    } catch {
      return {};
    }
  }

  private writeAttemptsStore(value: Record<string, StoredPaymentAttempt>): void {
    sessionStorage.setItem(PaymentsService.attemptsStorageKey, JSON.stringify(value));
    localStorage.removeItem(PaymentsService.attemptsStorageKey);
  }

  private composeAttemptKey(orderId: string, attemptId: string): string {
    return `pay:${orderId}:${attemptId}`;
  }

  private generateAttemptId(): string {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `${stamp}${rand}`;
  }

  private pickString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private readUrlFields(value: Record<string, unknown> | null): string | null {
    if (!value) {
      return null;
    }

    const candidates = [
      'redirectUrl',
      'redirect_url',
      'url',
      'paymentUrl',
      'payment_url',
      'checkoutUrl',
      'checkout_url',
      'invoiceUrl',
      'invoice_url'
    ];

    for (const key of candidates) {
      const raw = value[key];
      if (typeof raw === 'string' && this.isHttpUrl(raw)) {
        return raw;
      }
    }

    return null;
  }

  private findFirstUrl(value: unknown): string | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const queue: unknown[] = [value];
    let depth = 0;

    while (queue.length > 0 && depth < 30) {
      depth += 1;
      const current = queue.shift();
      if (!current || typeof current !== 'object') {
        continue;
      }

      for (const item of Object.values(current as Record<string, unknown>)) {
        if (typeof item === 'string' && this.isHttpUrl(item)) {
          return item;
        }

        if (item && typeof item === 'object') {
          queue.push(item);
        }
      }
    }

    return null;
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
  }
}
