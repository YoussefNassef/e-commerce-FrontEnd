import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { SupportMessage, SupportTicketDetails, SupportTicketPriority, SupportTicketStatus, SupportTicketSummary } from '../../core/models/support.models';
import { AuthService } from '../../core/services/auth.service';
import { SupportService } from '../../core/services/support.service';
import { SupportStreamService } from '../../core/services/support-stream.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-admin-support-page',
  imports: [DatePipe, FormsModule, ButtonComponent, CardComponent, StatePanelComponent],
  templateUrl: './admin-support-page.component.html',
  styleUrl: './admin-support-page.component.css'
})
export class AdminSupportPageComponent {
  private readonly supportService = inject(SupportService);
  private readonly streamService = inject(SupportStreamService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private streamRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private streamAuthRefreshInFlight = false;
  private ticketFromQuery = '';

  protected readonly loading = signal(true);
  protected readonly loadingDetails = signal(false);
  protected readonly assigning = signal(false);
  protected readonly updatingStatus = signal(false);
  protected readonly replying = signal(false);
  protected readonly streamConnected = signal(false);
  protected readonly unreadCount = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly rateLimitMessage = signal('');
  protected readonly tickets = signal<SupportTicketSummary[]>([]);
  protected readonly selectedTicket = signal<SupportTicketDetails | null>(null);
  protected readonly selectedTicketId = signal('');
  protected readonly filterStatus = signal<SupportTicketStatus | 'all'>('all');
  protected readonly filterPriority = signal<SupportTicketPriority | 'all'>('all');
  protected readonly assignToMeOnly = signal(false);
  protected readonly replyMessage = signal('');
  protected readonly statusDraft = signal<SupportTicketStatus>('open');
  protected readonly statusNoteDraft = signal('');

  protected readonly statuses: SupportTicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
  protected readonly priorities: SupportTicketPriority[] = ['low', 'normal', 'high', 'urgent'];

  constructor() {
    const querySub = this.route.queryParamMap.subscribe((params) => {
      const ticketId = (params.get('ticketId') ?? '').trim();
      this.ticketFromQuery = ticketId;
      if (!ticketId) {
        return;
      }
      if (this.selectedTicketId() === ticketId) {
        return;
      }
      this.openTicket(ticketId);
    });
    this.destroyRef.onDestroy(() => querySub.unsubscribe());

    this.loadTickets();
    this.refreshUnreadCount();

    effect(() => {
      const authHeader = this.auth.authHeaderValue();
      if (!authHeader) {
        this.streamService.disconnect('admin');
        this.tryRefreshTokenForStream();
        return;
      }
      this.streamService.connect('admin', () => this.auth.authHeaderValue());
    });

    this.streamService.connectedState$.subscribe((state) => this.streamConnected.set(state.admin));
    this.streamService.events$.subscribe((event) => {
      if (event.scope !== 'admin') {
        return;
      }
      this.handleStreamEvent(event.ticketId);
    });

    this.destroyRef.onDestroy(() => {
      this.streamService.disconnect('admin');
      if (this.streamRefreshTimer) {
        clearTimeout(this.streamRefreshTimer);
        this.streamRefreshTimer = null;
      }
    });
  }

  protected loadTickets(): void {
    this.loading.set(true);
    this.error.set('');
    this.rateLimitMessage.set('');

    const filterStatus = this.filterStatus();
    const filterPriority = this.filterPriority();

    this.supportService
      .getAdminTickets({
        page: 1,
        limit: 100,
        status: filterStatus === 'all' ? undefined : filterStatus,
        priority: filterPriority === 'all' ? undefined : filterPriority,
        assignedToMe: this.assignToMeOnly()
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.tickets.set(response.items);
          this.refreshUnreadCount();
          if (!response.items.length) {
            this.selectedTicketId.set('');
            this.selectedTicket.set(null);
            return;
          }

          const ticketFromQuery = this.ticketFromQuery;
          const id =
            (ticketFromQuery && response.items.some((item) => item.id === ticketFromQuery) ? ticketFromQuery : '') ||
            this.selectedTicketId() ||
            response.items[0]?.id ||
            '';
          if (id) {
            this.openTicket(id, false);
          }
        },
        error: (err) => this.handleSupportError(err, 'تعذر تحميل تذاكر الدعم.')
      });
  }

  protected retryAfterRateLimit(): void {
    this.rateLimitMessage.set('');
    this.loadTickets();
  }

  protected openTicket(ticketId: string, refreshCounters = true): void {
    if (!ticketId) {
      return;
    }

    this.selectedTicketId.set(ticketId);
    this.loadingDetails.set(true);
    this.error.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .getAdminTicketDetails(ticketId)
      .pipe(finalize(() => this.loadingDetails.set(false)))
      .subscribe({
        next: (details) => {
          this.selectedTicket.set(details);
          this.statusDraft.set(details.status);
          this.statusNoteDraft.set('');
          this.patchTicketInList(details);
          if (refreshCounters) {
            this.refreshUnreadCount();
          }
        },
        error: (err) => this.handleSupportError(err, 'تعذر تحميل تفاصيل التذكرة.')
      });
  }

  protected toggleAssignedToMe(value: boolean): void {
    this.assignToMeOnly.set(value);
    this.loadTickets();
  }

  protected applyFilters(): void {
    this.loadTickets();
  }

  protected assignCurrentTicketToMe(): void {
    const ticketId = this.selectedTicketId();
    if (!ticketId || this.assigning()) {
      return;
    }

    this.assigning.set(true);
    this.error.set('');
    this.notice.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .assignAdminTicketToMe(ticketId)
      .pipe(finalize(() => this.assigning.set(false)))
      .subscribe({
        next: (updated) => {
          this.notice.set('تم إسناد التذكرة لك.');
          this.selectedTicket.set(updated);
          this.patchTicketInList(updated);
          this.refreshUnreadCount();
        },
        error: (err) => this.handleSupportError(err, 'تعذر إسناد التذكرة.')
      });
  }

  protected updateTicketStatus(): void {
    const ticketId = this.selectedTicketId();
    if (!ticketId || this.updatingStatus()) {
      return;
    }

    this.updatingStatus.set(true);
    this.error.set('');
    this.notice.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .updateAdminTicketStatus(ticketId, {
        status: this.statusDraft(),
        note: this.statusNoteDraft().trim() || undefined
      })
      .pipe(finalize(() => this.updatingStatus.set(false)))
      .subscribe({
        next: (updated) => {
          this.notice.set('تم تحديث حالة التذكرة.');
          this.selectedTicket.set(updated);
          this.patchTicketInList(updated);
          this.statusNoteDraft.set('');
          this.refreshUnreadCount();
        },
        error: (err) => this.handleSupportError(err, 'تعذر تحديث حالة التذكرة.')
      });
  }

  protected sendAdminReply(): void {
    const ticketId = this.selectedTicketId();
    const message = this.replyMessage().trim();
    const ticket = this.selectedTicket();
    if (!ticketId || !message || this.replying() || !this.canReply(ticket?.status ?? '')) {
      return;
    }

    this.replying.set(true);
    this.error.set('');
    this.notice.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .addAdminMessage(ticketId, { message })
      .pipe(finalize(() => this.replying.set(false)))
      .subscribe({
        next: (createdMessage) => {
          this.notice.set('تم إرسال الرد.');
          this.replyMessage.set('');
          this.selectedTicket.update((current) =>
            current
              ? {
                  ...current,
                  messages: [...current.messages, createdMessage],
                  lastMessageAt: createdMessage.createdAt
                }
              : current
          );
          this.refreshTicketSummary(ticketId);
          this.refreshUnreadCount();
        },
        error: (err) => this.handleSupportError(err, 'تعذر إرسال الرد.')
      });
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'in_progress':
        return 'قيد المعالجة';
      case 'waiting_customer':
        return 'بانتظار العميل';
      case 'resolved':
        return 'تم الحل';
      case 'closed':
        return 'مغلقة';
      default:
        return 'مفتوحة';
    }
  }

  protected priorityLabel(priority: string): string {
    switch (priority) {
      case 'low':
        return 'منخفضة';
      case 'high':
        return 'عالية';
      case 'urgent':
        return 'عاجلة';
      default:
        return 'عادية';
    }
  }

  protected messageAuthorLabel(message: SupportMessage): string {
    if (message.authorRole === 'admin') {
      return message.authorName?.trim() || 'إدمن';
    }

    const ticket = this.selectedTicket();
    const ticketUserName = ticket?.userName?.trim();
    const listUserName = ticket ? this.tickets().find((item) => item.id === ticket.id)?.userName?.trim() : '';
    const bestName = message.authorName?.trim() || ticketUserName || listUserName || '';
    return bestName || `عميل #${message.authorUserId}`;
  }

  protected canReply(status: string): boolean {
    return status !== 'closed' && status !== 'resolved';
  }

  private handleStreamEvent(ticketId: string | null): void {
    this.refreshUnreadCount();

    if (!ticketId) {
      this.scheduleListRefresh();
      return;
    }

    if (this.selectedTicketId() === ticketId) {
      this.openTicket(ticketId);
      return;
    }

    const hasRow = this.tickets().some((item) => item.id === ticketId);
    if (hasRow) {
      this.refreshTicketSummary(ticketId);
      return;
    }

    this.scheduleListRefresh();
  }

  private tryRefreshTokenForStream(): void {
    if (this.streamAuthRefreshInFlight) {
      return;
    }
    this.streamAuthRefreshInFlight = true;
    this.auth
      .refreshAccessToken()
      .pipe(finalize(() => (this.streamAuthRefreshInFlight = false)))
      .subscribe({
        next: () => {
          const authHeader = this.auth.authHeaderValue();
          if (authHeader) {
            this.streamService.connect('admin', () => this.auth.authHeaderValue());
          }
        },
        error: () => undefined
      });
  }

  private scheduleListRefresh(): void {
    if (this.streamRefreshTimer) {
      clearTimeout(this.streamRefreshTimer);
    }
    this.streamRefreshTimer = setTimeout(() => {
      this.loadTickets();
      this.streamRefreshTimer = null;
    }, 240);
  }

  private refreshTicketSummary(ticketId: string): void {
    this.supportService.getAdminTicketDetails(ticketId).subscribe({
      next: (details) => this.patchTicketInList(details),
      error: () => undefined
    });
  }

  private patchTicketInList(ticket: SupportTicketSummary): void {
    this.tickets.update((items) => {
      const idx = items.findIndex((item) => item.id === ticket.id);
      if (idx === -1) {
        return [ticket, ...items];
      }
      const next = [...items];
      next[idx] = { ...next[idx], ...ticket };
      return next;
    });
  }

  private refreshUnreadCount(): void {
    this.supportService.getAdminUnreadCount().subscribe({
      next: (count) => this.unreadCount.set(count),
      error: () => this.unreadCount.set(0)
    });
  }

  private handleSupportError(err: unknown, fallback: string): void {
    const rateLimit = this.extractRateLimitMessage(err);
    if (rateLimit) {
      this.rateLimitMessage.set(rateLimit);
      this.error.set('');
      return;
    }

    this.rateLimitMessage.set('');
    this.error.set(this.extractServerMessage(err) || fallback);
  }

  private extractRateLimitMessage(err: unknown): string | null {
    const httpErr = err as HttpErrorResponse | null;
    if (!httpErr) {
      return null;
    }

    const statusCode = httpErr.status;
    const body = this.asRecord(httpErr.error);
    const envelopeStatus = typeof body?.['statusCode'] === 'number' ? body['statusCode'] : null;
    const isRateLimited = statusCode === 429 || envelopeStatus === 429;
    if (!isRateLimited) {
      return null;
    }

    const headerValue = httpErr.headers?.get('Retry-After');
    const retryAfter = headerValue ? Number(headerValue) : NaN;
    const retryMsg = Number.isFinite(retryAfter) && retryAfter > 0 ? ` بعد ${Math.round(retryAfter)} ثانية` : '';
    return `تم تجاوز حد الطلبات لصفحة الدعم. حاول مرة أخرى${retryMsg}.`;
  }

  private extractServerMessage(err: unknown): string {
    const payload = this.asRecord((err as { error?: unknown } | null)?.error);
    if (!payload) {
      return '';
    }
    const message = payload['message'];
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' | ');
    }
    return '';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
