import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface NotificationsListResponse {
  items: AppNotification[];
  meta: NotificationsMeta;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getNotifications(page = 1, limit = 10) {
    return this.http
      .get<unknown>(`${this.api}/notifications`, { params: { page, limit } })
      .pipe(map((response) => this.normalizeListResponse(response, page, limit)));
  }

  getUnreadCount() {
    return this.http.get<unknown>(`${this.api}/notifications/unread-count`).pipe(map((response) => this.normalizeUnreadCount(response)));
  }

  markAsRead(notificationId: string) {
    return this.http
      .patch<unknown>(`${this.api}/notifications/${notificationId}/read`, {})
      .pipe(map((response) => this.normalizeNotification(this.extractSource(response))));
  }

  markAllAsRead() {
    return this.http
      .patch<unknown>(`${this.api}/notifications/mark-all-read`, {})
      .pipe(map((response) => this.normalizeUpdatedCount(response)));
  }

  private normalizeListResponse(response: unknown, fallbackPage: number, fallbackLimit: number): NotificationsListResponse {
    const source = this.extractSource(response);
    const itemsSource = Array.isArray(source['items']) ? source['items'] : [];
    const metaSource = this.toRecord(source['meta']) ?? {};

    return {
      items: itemsSource
        .map((item) => this.normalizeNotification(item))
        .filter((item): item is AppNotification => !!item),
      meta: {
        page: this.toNumber(metaSource['page'], fallbackPage),
        limit: this.toNumber(metaSource['limit'], fallbackLimit),
        totalItems: this.toNumber(metaSource['totalItems'], itemsSource.length),
        totalPages: this.toNumber(metaSource['totalPages'], 1),
        hasNextPage: this.toBoolean(metaSource['hasNextPage'], false),
        hasPreviousPage: this.toBoolean(metaSource['hasPreviousPage'], false)
      }
    };
  }

  private normalizeUnreadCount(response: unknown): number {
    const source = this.extractSource(response);
    return this.toNumber(source['unreadCount'] ?? source['count'], 0);
  }

  private normalizeUpdatedCount(response: unknown): number {
    const source = this.extractSource(response);
    return this.toNumber(source['updatedCount'], 0);
  }

  private normalizeNotification(input: unknown): AppNotification | null {
    const record = this.toRecord(input);
    if (!record) {
      return null;
    }

    const id = String(record['id'] ?? '').trim();
    if (!id) {
      return null;
    }

    return {
      id,
      type: String(record['type'] ?? '').trim(),
      title: String(record['title'] ?? '').trim(),
      body: String(record['body'] ?? '').trim(),
      data: this.toRecord(record['data']),
      isRead: this.toBoolean(record['isRead'], false),
      readAt: typeof record['readAt'] === 'string' ? record['readAt'] : null,
      createdAt: typeof record['createdAt'] === 'string' ? record['createdAt'] : ''
    };
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

  private toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
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
