import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import {
  CreateReturnRequestPayload,
  ReturnRequestDto,
  ReturnStatus,
  UpdateReturnRequestStatusPayload,
} from '../models/returns.models';
import { environment } from '../models/environment';

@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  createReturnRequest(payload: CreateReturnRequestPayload) {
    return this.http
      .post<unknown>(`${this.api}/returns`, payload)
      .pipe(map((response) => this.toReturnRequestDto(this.extractSource(response))));
  }

  getMyReturnRequests() {
    return this.http
      .get<unknown>(`${this.api}/returns/me`)
      .pipe(map((response) => this.extractList(response).map((item) => this.toReturnRequestDto(item))));
  }

  cancelMyReturnRequest(id: string) {
    return this.http
      .patch<unknown>(`${this.api}/returns/${id}/cancel`, {})
      .pipe(map((response) => this.toReturnRequestDto(this.extractSource(response))));
  }

  getAllReturnRequests(status?: ReturnStatus) {
    return this.http
      .get<unknown>(`${this.api}/returns`, {
        params: status ? { status } : {},
      })
      .pipe(map((response) => this.extractList(response).map((item) => this.toReturnRequestDto(item))));
  }

  updateReturnRequestStatus(id: string, payload: UpdateReturnRequestStatusPayload) {
    return this.http
      .patch<unknown>(`${this.api}/returns/${id}/status`, payload)
      .pipe(map((response) => this.toReturnRequestDto(this.extractSource(response))));
  }

  private toReturnRequestDto(source: Record<string, unknown>): ReturnRequestDto {
    const toNullableString = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    const toNullableNumber = (value: unknown): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? value : null;

    const statusRaw = String(source['status'] ?? 'requested').toLowerCase().trim();
    const status: ReturnStatus =
      statusRaw === 'approved' ||
      statusRaw === 'rejected' ||
      statusRaw === 'refund_initiated' ||
      statusRaw === 'refunded' ||
      statusRaw === 'cancelled'
        ? statusRaw
        : 'requested';

    return {
      id: String(source['id'] ?? ''),
      orderId: String(source['orderId'] ?? ''),
      userId: Number(source['userId'] ?? 0),
      reason: String(source['reason'] ?? 'other') as ReturnRequestDto['reason'],
      reasonDetails: toNullableString(source['reasonDetails']),
      status,
      refundAmount: Number(source['refundAmount'] ?? 0),
      adminNote: toNullableString(source['adminNote']),
      handledByAdminUserId: toNullableNumber(source['handledByAdminUserId']),
      approvedAt: toNullableString(source['approvedAt']),
      rejectedAt: toNullableString(source['rejectedAt']),
      refundInitiatedAt: toNullableString(source['refundInitiatedAt']),
      refundedAt: toNullableString(source['refundedAt']),
      cancelledAt: toNullableString(source['cancelledAt']),
      createdAt: String(source['createdAt'] ?? ''),
      updatedAt: String(source['updatedAt'] ?? ''),
    };
  }

  private extractSource(value: unknown): Record<string, unknown> {
    const record = this.toRecord(value);
    const data = this.toRecord(record?.['data']);
    const nested = this.toRecord(data?.['data']);
    return nested ?? data ?? record ?? {};
  }

  private extractList(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.toRecord(item) ?? {});
    }

    const record = this.toRecord(value) ?? {};
    const data = record['data'];

    if (Array.isArray(data)) {
      return data.map((item) => this.toRecord(item) ?? {});
    }

    const dataRecord = this.toRecord(data);
    if (Array.isArray(dataRecord?.['items'])) {
      return (dataRecord['items'] as unknown[]).map((item) => this.toRecord(item) ?? {});
    }

    if (Array.isArray(record['items'])) {
      return (record['items'] as unknown[]).map((item) => this.toRecord(item) ?? {});
    }

    return [];
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
