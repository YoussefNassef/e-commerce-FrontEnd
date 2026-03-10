import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';
import {
  AddOrderAdminNotePayload,
  AdminOrderActionPayload,
  AdminOrderAuditAction,
  AdminOrderAuditItem,
  AdminOrderAuditResponse,
  BulkAdminOrderActionPayload,
  BulkAdminOrderActionResponse
} from '../models/admin-orders.models';

@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  addOrderAdminNote(orderId: string, payload: AddOrderAdminNotePayload) {
    return this.http.post<unknown>(`${this.api}/admin/orders/${orderId}/notes`, payload);
  }

  runOrderAdminAction(orderId: string, payload: AdminOrderActionPayload) {
    return this.http.post<unknown>(`${this.api}/admin/orders/${orderId}/actions`, payload);
  }

  getOrderAdminAudit(orderId: string, page = 1, limit = 20) {
    return this.http
      .get<unknown>(`${this.api}/admin/orders/${orderId}/audit`, {
        params: { page: String(Math.max(1, page)), limit: String(Math.max(1, limit)) }
      })
      .pipe(map((response) => this.normalizeAuditResponse(response, page, limit)));
  }

  runBulkOrderAdminAction(payload: BulkAdminOrderActionPayload) {
    return this.http
      .post<unknown>(`${this.api}/admin/orders/bulk-actions`, payload)
      .pipe(map((response) => this.normalizeBulkResponse(response, payload.orderIds.length)));
  }

  private normalizeAuditResponse(response: unknown, fallbackPage: number, fallbackLimit: number): AdminOrderAuditResponse {
    const source = this.extractSource(response);
    const meta = this.toRecord(source['meta']) ?? {};
    const itemsSource = Array.isArray(source['items']) ? source['items'] : [];
    const items = itemsSource
      .map((item) => this.normalizeAuditItem(item))
      .filter((item): item is AdminOrderAuditItem => !!item);

    const page = this.toNumber(meta['page'], fallbackPage);
    const limit = this.toNumber(meta['limit'], fallbackLimit);
    const totalItems = this.toNumber(meta['totalItems'], items.length);
    const totalPages = this.toNumber(meta['totalPages'], Math.max(1, Math.ceil(totalItems / Math.max(1, limit))));

    return {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: this.toBoolean(meta['hasNextPage'], page < totalPages),
        hasPreviousPage: this.toBoolean(meta['hasPreviousPage'], page > 1)
      }
    };
  }

  private normalizeAuditItem(input: unknown): AdminOrderAuditItem | null {
    const row = this.toRecord(input);
    if (!row) {
      return null;
    }

    const id = this.toString(row['id']);
    const orderId = this.toString(row['orderId']);
    if (!id || !orderId) {
      return null;
    }

    return {
      id,
      orderId,
      action: this.toAuditAction(row['action']),
      adminUserId: this.toNumber(row['adminUserId'], 0),
      note: this.toNullableString(row['note']),
      metadata: this.toRecord(row['metadata']) ?? {},
      createdAt: this.toString(row['createdAt'])
    };
  }

  private normalizeBulkResponse(response: unknown, fallbackTotal: number): BulkAdminOrderActionResponse {
    const source = this.extractSource(response);
    const failuresSource = Array.isArray(source['failures']) ? source['failures'] : [];
    return {
      total: this.toNumber(source['total'], fallbackTotal),
      successCount: this.toNumber(source['successCount'], 0),
      failureCount: this.toNumber(source['failureCount'], failuresSource.length),
      successes: Array.isArray(source['successes'])
        ? source['successes'].map((item) => this.toString(item)).filter((item) => item.length > 0)
        : [],
      failures: failuresSource.map((item) => {
        const row = this.toRecord(item);
        if (!row) {
          return { orderId: '', message: '' };
        }
        return {
          orderId: this.toString(row['orderId'] ?? row['id']),
          message: this.toString(row['message'])
        };
      })
    };
  }

  private toAuditAction(value: unknown): AdminOrderAuditAction {
    const normalized = this.toString(value).toLowerCase();
    switch (normalized) {
      case 'note_added':
      case 'order_status_updated':
      case 'delivery_tracking_updated':
      case 'order_cancelled':
      case 'bulk_action_executed':
        return normalized;
      default:
        return 'note_added';
    }
  }

  private extractSource(response: unknown): Record<string, unknown> {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nestedData = this.toRecord(data?.['data']);
    return nestedData ?? data ?? record;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private toString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return fallback;
  }
}
