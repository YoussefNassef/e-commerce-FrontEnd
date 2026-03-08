import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  value: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export interface CreateCouponPayload {
  code: string;
  discountType: 'percentage' | 'fixed';
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number | null;
  usageLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CouponsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getCoupons() {
    return this.http.get<unknown>(`${this.api}/coupons`).pipe(map((response) => this.normalizeCouponsResponse(response)));
  }

  createCoupon(payload: CreateCouponPayload) {
    return this.http.post<unknown>(`${this.api}/coupons`, payload).pipe(map((response) => this.extractSingleCoupon(response)));
  }

  updateCoupon(couponId: string, payload: Partial<CreateCouponPayload>) {
    return this.http.patch<unknown>(`${this.api}/coupons/${couponId}`, payload).pipe(map((response) => this.extractSingleCoupon(response)));
  }

  deleteCoupon(couponId: string) {
    return this.http.delete<unknown>(`${this.api}/coupons/${couponId}`);
  }

  private normalizeCouponsResponse(response: unknown): Coupon[] {
    const list = this.extractList(response);
    return list
      .map((item) => this.toCoupon(item))
      .filter((item): item is Coupon => !!item);
  }

  private extractSingleCoupon(response: unknown): Coupon | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const record = response as Record<string, unknown>;
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    return this.toCoupon((nested ?? data ?? record) as unknown);
  }

  private extractList(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    if (!response || typeof response !== 'object') {
      return [];
    }

    const record = response as Record<string, unknown>;
    if (Array.isArray(record['data'])) {
      return record['data'] as unknown[];
    }

    const data = this.toRecord(record['data']);
    if (data) {
      if (Array.isArray(data['items'])) {
        return data['items'] as unknown[];
      }
      if (Array.isArray(data['coupons'])) {
        return data['coupons'] as unknown[];
      }
      if (Array.isArray(data['data'])) {
        return data['data'] as unknown[];
      }
    }

    if (Array.isArray(record['items'])) {
      return record['items'] as unknown[];
    }

    return [];
  }

  private toCoupon(input: unknown): Coupon | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const record = input as Record<string, unknown>;
    const id = String(record['id'] ?? '').trim();
    const code = String(record['code'] ?? '').trim();

    if (!id || !code) {
      return null;
    }

    const rawType = String(record['discountType'] ?? record['type'] ?? 'percentage').toLowerCase().trim();
    const discountType: 'percentage' | 'fixed' =
      rawType === 'fixed' || rawType === 'amount' ? 'fixed' : 'percentage';

    const startsAt = typeof record['startsAt'] === 'string' ? record['startsAt'] : null;
    const endsAt = typeof record['endsAt'] === 'string' ? record['endsAt'] : null;

    return {
      id,
      code,
      discountType,
      value: Number(record['value'] ?? record['discountValue'] ?? 0),
      minOrderAmount: Number(record['minOrderAmount'] ?? 0),
      maxDiscount: record['maxDiscount'] == null ? null : Number(record['maxDiscount']),
      usageLimit: record['usageLimit'] == null ? null : Number(record['usageLimit']),
      usedCount: Number(record['usedCount'] ?? 0),
      startsAt,
      endsAt,
      isActive: Boolean(record['isActive'] ?? true)
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}

