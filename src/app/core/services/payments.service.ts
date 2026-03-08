import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
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

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  createPayment(payload: CreatePaymentPayload) {
    const idempotencyKey = this.buildIdempotencyKey(payload.orderId);
    return this.http
      .post<unknown>(`${this.api}/payments/create`, payload, {
        headers: {
          'idempotency-key': idempotencyKey
        }
      })
      .pipe(
        map((response) => this.normalizePaymentResponse(response)),
        catchError(() =>
          this.http
            .post<unknown>(`${this.api}/payments/moyasar`, payload, {
              headers: {
                'idempotency-key': idempotencyKey
              }
            })
            .pipe(map((response) => this.normalizePaymentResponse(response)))
        )
      );
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

  private pickString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
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

  private buildIdempotencyKey(orderId: string): string {
    const shortOrder = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'order';
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `checkout-${shortOrder}-${stamp}-${rand}`;
  }

}
