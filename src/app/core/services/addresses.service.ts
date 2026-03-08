import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Address } from '../models/api.models';
import { environment } from '../models/environment';

export interface CreateAddressPayload {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  country: string;
}

@Injectable({ providedIn: 'root' })
export class AddressesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getAddresses() {
    return this.http.get<unknown>(`${this.api}/addresses`).pipe(map((response) => this.normalizeAddresses(response)));
  }

  createAddress(payload: CreateAddressPayload) {
    return this.http.post<unknown>(`${this.api}/addresses`, payload).pipe(map((response) => this.extractSingleAddress(response)));
  }

  updateAddress(addressId: string, payload: Partial<CreateAddressPayload>) {
    return this.http.patch<unknown>(`${this.api}/addresses/${addressId}`, payload).pipe(map((response) => this.extractSingleAddress(response)));
  }

  deleteAddress(addressId: string) {
    return this.http.delete<unknown>(`${this.api}/addresses/${addressId}`);
  }

  setDefaultAddress(addressId: string) {
    return this.http.patch<unknown>(`${this.api}/addresses/${addressId}/default`, {});
  }

  private normalizeAddresses(response: unknown): Address[] {
    const list = this.extractList(response);
    return list
      .map((item) => this.toAddress(item))
      .filter((item): item is Address => !!item);
  }

  private extractSingleAddress(response: unknown): Address | null {
    if (!response || typeof response !== 'object') {
      return null;
    }
    const record = response as Record<string, unknown>;
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    return this.toAddress(nested ?? data ?? record);
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
      if (Array.isArray(data['addresses'])) {
        return data['addresses'] as unknown[];
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

  private toAddress(input: unknown): Address | null {
    const record = this.toRecord(input);
    if (!record) {
      return null;
    }

    const id = String(record['id'] ?? '').trim();
    const label = String(record['label'] ?? '').trim();
    const recipientName = String(record['recipientName'] ?? '').trim();
    const phone = String(record['phone'] ?? '').trim();
    const line1 = String(record['line1'] ?? '').trim();
    const city = String(record['city'] ?? '').trim();
    const country = String(record['country'] ?? '').trim();

    if (!id || !label || !recipientName || !phone || !line1 || !city || !country) {
      return null;
    }

    return {
      id,
      label,
      recipientName,
      phone,
      line1,
      line2: typeof record['line2'] === 'string' ? record['line2'] : null,
      city,
      state: typeof record['state'] === 'string' ? record['state'] : null,
      postalCode: typeof record['postalCode'] === 'string' ? record['postalCode'] : null,
      country,
      isDefault: Boolean(record['isDefault'] ?? false)
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}

