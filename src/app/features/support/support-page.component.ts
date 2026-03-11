import { DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs/operators';
import {
  CreateSupportTicketPayload,
  SupportTicketCategory,
  SupportTicketDetails,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketSummary
} from '../../core/models/support.models';
import { AuthService } from '../../core/services/auth.service';
import { SupportService } from '../../core/services/support.service';
import { SupportStreamService } from '../../core/services/support-stream.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-support-page',
  imports: [DatePipe, FormsModule, ButtonComponent, CardComponent, StatePanelComponent],
  templateUrl: './support-page.component.html',
  styleUrl: './support-page.component.css'
})
export class SupportPageComponent {
  private readonly supportService = inject(SupportService);
  private readonly streamService = inject(SupportStreamService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private streamRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private streamAuthRefreshInFlight = false;
  private ticketFromQuery = '';

  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly loadingDetails = signal(false);
  protected readonly replying = signal(false);
  protected readonly changingTicketState = signal(false);
  protected readonly streamConnected = signal(false);
  protected readonly unreadCount = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly rateLimitMessage = signal('');
  protected readonly tickets = signal<SupportTicketSummary[]>([]);
  protected readonly selectedTicket = signal<SupportTicketDetails | null>(null);
  protected readonly selectedTicketId = signal('');
  protected readonly replyMessage = signal('');

  protected readonly createForm = signal<CreateSupportTicketPayload>({
    subject: '',
    message: '',
    orderId: '',
    priority: 'normal',
    category: 'other'
  });

  protected readonly priorities: SupportTicketPriority[] = ['low', 'normal', 'high', 'urgent'];
  protected readonly categories: SupportTicketCategory[] = ['order', 'payment', 'return', 'technical', 'account', 'other'];

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
        this.streamService.disconnect('customer');
        this.tryRefreshTokenForStream();
        return;
      }
      this.streamService.connect('customer', () => this.auth.authHeaderValue());
    });

    this.streamService.connectedState$.subscribe((state) => this.streamConnected.set(state.customer));
    this.streamService.events$.subscribe((event) => {
      if (event.scope !== 'customer') {
        return;
      }
      this.handleStreamEvent(event.ticketId);
    });

    this.destroyRef.onDestroy(() => {
      this.streamService.disconnect('customer');
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

    this.supportService
      .getMyTickets({ page: 1, limit: 50 })
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
          const activeId =
            (ticketFromQuery && response.items.some((item) => item.id === ticketFromQuery) ? ticketFromQuery : '') ||
            this.selectedTicketId() ||
            response.items[0]?.id ||
            '';
          if (activeId) {
            this.openTicket(activeId, false);
          }
        },
        error: (err) => this.handleSupportError(err, 'تعذر تحميل تذاكر الدعم.')
      });
  }

  protected retryAfterRateLimit(): void {
    this.rateLimitMessage.set('');
    this.loadTickets();
  }

  protected updateDraft(patch: Partial<CreateSupportTicketPayload>): void {
    this.createForm.update((draft) => ({ ...draft, ...patch }));
  }

  protected submitTicket(): void {
    const draft = this.createForm();
    const payload: CreateSupportTicketPayload = {
      subject: (draft.subject ?? '').trim(),
      message: (draft.message ?? '').trim(),
      priority: draft.priority ?? 'normal',
      category: draft.category ?? 'other',
      orderId: draft.orderId?.trim() || undefined
    };

    if (!payload.subject || !payload.message) {
      this.error.set('اكتب عنوان التذكرة والرسالة أولاً.');
      return;
    }

    this.creating.set(true);
    this.notice.set('');
    this.error.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .createTicket(payload)
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (created) => {
          this.notice.set('تم إرسال تذكرة الدعم بنجاح.');
          this.createForm.set({
            subject: '',
            message: '',
            orderId: '',
            priority: 'normal',
            category: 'other'
          });
          this.tickets.update((items) => [created, ...items.filter((item) => item.id !== created.id)]);
          this.openTicket(created.id);
        },
        error: (err) => this.handleSupportError(err, 'تعذر إرسال تذكرة الدعم.')
      });
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
      .getMyTicketDetails(ticketId)
      .pipe(finalize(() => this.loadingDetails.set(false)))
      .subscribe({
        next: (details) => {
          this.selectedTicket.set(details);
          this.patchTicketInList(details);
          if (refreshCounters) {
            this.refreshUnreadCount();
          }
        },
        error: (err) => this.handleSupportError(err, 'تعذر تحميل تفاصيل التذكرة.')
      });
  }

  protected sendReply(): void {
    const ticketId = this.selectedTicketId();
    const message = this.replyMessage().trim();
    const ticket = this.selectedTicket();
    if (!ticketId || !message || !this.canReply(ticket?.status ?? '')) {
      return;
    }

    this.replying.set(true);
    this.error.set('');
    this.notice.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .addMyMessage(ticketId, { message })
      .pipe(finalize(() => this.replying.set(false)))
      .subscribe({
        next: (createdMessage) => {
          this.replyMessage.set('');
          this.notice.set('تم إرسال الرد.');
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

  protected closeSelectedTicket(): void {
    const ticket = this.selectedTicket();
    if (!ticket || ticket.status === 'closed' || this.changingTicketState()) {
      return;
    }

    this.changingTicketState.set(true);
    this.notice.set('');
    this.error.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .closeMyTicket(ticket.id)
      .pipe(finalize(() => this.changingTicketState.set(false)))
      .subscribe({
        next: (updated) => {
          this.notice.set('تم إغلاق التذكرة.');
          this.selectedTicket.set(updated);
          this.patchTicketInList(updated);
          this.refreshUnreadCount();
        },
        error: (err) => this.handleSupportError(err, 'تعذر إغلاق التذكرة.')
      });
  }

  protected reopenSelectedTicket(): void {
    const ticket = this.selectedTicket();
    if (!ticket || ticket.status !== 'closed' || this.changingTicketState()) {
      return;
    }

    this.changingTicketState.set(true);
    this.notice.set('');
    this.error.set('');
    this.rateLimitMessage.set('');

    this.supportService
      .reopenMyTicket(ticket.id)
      .pipe(finalize(() => this.changingTicketState.set(false)))
      .subscribe({
        next: (updated) => {
          this.notice.set('تمت إعادة فتح التذكرة.');
          this.selectedTicket.set(updated);
          this.patchTicketInList(updated);
          this.refreshUnreadCount();
        },
        error: (err) => this.handleSupportError(err, 'تعذر إعادة فتح التذكرة.')
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

  protected categoryLabel(category: string): string {
    switch (category) {
      case 'order':
        return 'طلب';
      case 'payment':
        return 'دفع';
      case 'return':
        return 'إرجاع';
      case 'technical':
        return 'تقني';
      case 'account':
        return 'حساب';
      default:
        return 'أخرى';
    }
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
            this.streamService.connect('customer', () => this.auth.authHeaderValue());
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
    this.supportService.getMyTicketDetails(ticketId).subscribe({
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
    this.supportService.getMyUnreadCount().subscribe({
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
    return `تم تجاوز حد الطلبات للدعم. حاول مرة أخرى${retryMsg}.`;
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
