import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';
import {
  CreateSupportMessagePayload,
  CreateSupportTicketPayload,
  SupportMessage,
  SupportMessageAuthorRole,
  SupportTicketCategory,
  SupportTicketDetails,
  SupportTicketListResponse,
  SupportTicketPriority,
  SupportTicketsFilter,
  SupportTicketStatus,
  SupportTicketSummary,
  UpdateSupportTicketStatusPayload
} from '../models/support.models';

@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  createTicket(payload: CreateSupportTicketPayload) {
    return this.http.post<unknown>(`${this.api}/support/tickets`, payload).pipe(map((response) => this.extractTicketDetails(response)));
  }

  getMyUnreadCount() {
    return this.http
      .get<unknown>(`${this.api}/support/tickets/unread-count`)
      .pipe(map((response) => this.extractUnreadCount(response)));
  }

  getAdminUnreadCount() {
    return this.http
      .get<unknown>(`${this.api}/admin/support/tickets/unread-count`)
      .pipe(map((response) => this.extractUnreadCount(response)));
  }

  getMyTickets(filter: SupportTicketsFilter = {}) {
    return this.http
      .get<unknown>(`${this.api}/support/tickets/me`, { params: this.buildFilterParams(filter) })
      .pipe(map((response) => this.extractTicketList(response)));
  }

  getMyTicketDetails(ticketId: string) {
    return this.http
      .get<unknown>(`${this.api}/support/tickets/${ticketId}`)
      .pipe(map((response) => this.extractTicketDetails(response)));
  }

  addMyMessage(ticketId: string, payload: CreateSupportMessagePayload) {
    return this.http
      .post<unknown>(`${this.api}/support/tickets/${ticketId}/messages`, payload)
      .pipe(map((response) => this.extractMessage(response)));
  }

  closeMyTicket(ticketId: string) {
    return this.http
      .post<unknown>(`${this.api}/support/tickets/${ticketId}/close`, {})
      .pipe(map((response) => this.extractTicketDetails(response)));
  }

  reopenMyTicket(ticketId: string) {
    return this.http
      .post<unknown>(`${this.api}/support/tickets/${ticketId}/reopen`, {})
      .pipe(map((response) => this.extractTicketDetails(response)));
  }

  getAdminTickets(filter: SupportTicketsFilter = {}) {
    return this.http
      .get<unknown>(`${this.api}/admin/support/tickets`, { params: this.buildFilterParams(filter) })
      .pipe(map((response) => this.extractTicketList(response)));
  }

  getAdminTicketDetails(ticketId: string) {
    return this.http
      .get<unknown>(`${this.api}/admin/support/tickets/${ticketId}`)
      .pipe(map((response) => this.extractTicketDetails(response)));
  }

  updateAdminTicketStatus(ticketId: string, payload: UpdateSupportTicketStatusPayload) {
    return this.http
      .patch<unknown>(`${this.api}/admin/support/tickets/${ticketId}/status`, payload)
      .pipe(map((response) => this.extractTicketDetails(response)));
  }

  assignAdminTicketToMe(ticketId: string) {
    return this.http
      .patch<unknown>(`${this.api}/admin/support/tickets/${ticketId}/assign-me`, {})
      .pipe(map((response) => this.extractTicketDetails(response)));
  }

  addAdminMessage(ticketId: string, payload: CreateSupportMessagePayload) {
    return this.http
      .post<unknown>(`${this.api}/admin/support/tickets/${ticketId}/messages`, payload)
      .pipe(map((response) => this.extractMessage(response)));
  }

  private buildFilterParams(filter: SupportTicketsFilter): Record<string, string> {
    const params: Record<string, string> = {};
    if (typeof filter.page === 'number' && filter.page > 0) {
      params['page'] = String(filter.page);
    }
    if (typeof filter.limit === 'number' && filter.limit > 0) {
      params['limit'] = String(filter.limit);
    }
    if (filter.status) {
      params['status'] = filter.status;
    }
    if (filter.priority) {
      params['priority'] = filter.priority;
    }
    if (filter.orderId && filter.orderId.trim()) {
      params['orderId'] = filter.orderId.trim();
    }
    if (typeof filter.userId === 'number' && Number.isFinite(filter.userId)) {
      params['userId'] = String(filter.userId);
    }
    if (filter.assignedToMe === true) {
      params['assignedToMe'] = 'true';
    }
    return params;
  }

  private extractTicketList(response: unknown): SupportTicketListResponse {
    const record = this.toRecord(response) ?? {};
    const source = this.extractSource(response);
    const directList = this.extractList(source);
    const rootList = this.extractList(record);
    const list = directList.length ? directList : rootList;

    const sourceMeta = this.extractMeta(source);
    const rootMeta = this.extractMeta(record);
    const meta = sourceMeta ?? rootMeta;

    return {
      items: list.map((item) => this.toTicketSummary(item)),
      meta: {
        page: this.toNumber(meta?.['page'], 1),
        limit: this.toNumber(meta?.['limit'], list.length || 10),
        totalItems: this.toNumber(meta?.['totalItems'], list.length),
        totalPages: Math.max(1, this.toNumber(meta?.['totalPages'], 1))
      }
    };
  }

  private extractTicketDetails(response: unknown): SupportTicketDetails {
    const source = this.extractSource(response);
    return this.toTicketDetails(source);
  }

  private extractMessage(response: unknown): SupportMessage {
    const source = this.extractSource(response);
    return this.toMessage(source);
  }

  private extractUnreadCount(response: unknown): number {
    const source = this.extractSource(response);
    return this.toNumber(source['unreadCount']);
  }

  private toTicketDetails(source: Record<string, unknown>): SupportTicketDetails {
    const base = this.toTicketSummary(source);
    const messagesRaw = Array.isArray(source['messages']) ? source['messages'] : [];
    return {
      ...base,
      messages: messagesRaw.map((row) => this.toMessage(this.toRecord(row) ?? {}))
    };
  }

  private toTicketSummary(source: Record<string, unknown>): SupportTicketSummary {
    const userRecord = this.toRecord(source['user']);
    const customerRecord = this.toRecord(source['customer']);
    const profileRecord = this.toRecord(source['profile']);
    return {
      id: String(source['id'] ?? ''),
      userId: this.toNumber(source['userId']),
      userName: this.toNullableString(
        source['userName'] ??
          source['userFullName'] ??
          source['fullName'] ??
          source['customerName'] ??
          userRecord?.['fullName'] ??
          userRecord?.['name'] ??
          customerRecord?.['fullName'] ??
          customerRecord?.['name'] ??
          profileRecord?.['fullName'] ??
          profileRecord?.['name']
      ),
      unreadCount: this.toNumber(source['unreadCount']),
      orderId: this.toNullableString(source['orderId']),
      subject: String(source['subject'] ?? ''),
      status: this.toStatus(source['status']),
      priority: this.toPriority(source['priority']),
      category: this.toCategory(source['category']),
      assignedAdminUserId: this.toNullableNumber(source['assignedAdminUserId']),
      lastMessageAt: this.toNullableString(source['lastMessageAt']),
      closedAt: this.toNullableString(source['closedAt']),
      createdAt: String(source['createdAt'] ?? ''),
      updatedAt: String(source['updatedAt'] ?? '')
    };
  }

  private toMessage(source: Record<string, unknown>): SupportMessage {
    const authorRecord = this.toRecord(source['author']);
    const userRecord = this.toRecord(source['user']);
    return {
      id: String(source['id'] ?? ''),
      ticketId: String(source['ticketId'] ?? ''),
      authorUserId: this.toNumber(source['authorUserId']),
      authorRole: this.toAuthorRole(source['authorRole']),
      authorName: this.toNullableString(
        source['authorName'] ??
          source['authorFullName'] ??
          source['fullName'] ??
          source['userName'] ??
          source['userFullName'] ??
          authorRecord?.['fullName'] ??
          authorRecord?.['name'] ??
          userRecord?.['fullName'] ??
          userRecord?.['name']
      ),
      message: String(source['message'] ?? ''),
      isInternal: Boolean(source['isInternal']),
      createdAt: String(source['createdAt'] ?? '')
    };
  }

  private toStatus(value: unknown): SupportTicketStatus {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'in_progress' ||
      normalized === 'waiting_customer' ||
      normalized === 'resolved' ||
      normalized === 'closed'
      ? normalized
      : 'open';
  }

  private toPriority(value: unknown): SupportTicketPriority {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'low' || normalized === 'high' || normalized === 'urgent' ? normalized : 'normal';
  }

  private toCategory(value: unknown): SupportTicketCategory {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'order' ||
      normalized === 'payment' ||
      normalized === 'return' ||
      normalized === 'technical' ||
      normalized === 'account'
      ? normalized
      : 'other';
  }

  private toAuthorRole(value: unknown): SupportMessageAuthorRole {
    return String(value ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
  }

  private extractSource(value: unknown): Record<string, unknown> {
    const record = this.toRecord(value) ?? {};
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    return nested ?? data ?? record;
  }

  private extractList(source: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(source['items'])) {
      return (source['items'] as unknown[]).map((item) => this.toRecord(item) ?? {});
    }
    if (Array.isArray(source['data'])) {
      return (source['data'] as unknown[]).map((item) => this.toRecord(item) ?? {});
    }
    return [];
  }

  private extractMeta(source: Record<string, unknown>): Record<string, unknown> | null {
    const meta = this.toRecord(source['meta']);
    if (meta) {
      return meta;
    }
    const pagination = this.toRecord(source['pagination']);
    if (pagination) {
      return pagination;
    }
    return null;
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
