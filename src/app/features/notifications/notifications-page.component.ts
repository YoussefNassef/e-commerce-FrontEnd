import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { AppNotification, NotificationsService } from '../../core/services/notifications.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, RouterLink, ButtonComponent, CardComponent, LoadingSpinnerComponent],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.css'
})
export class NotificationsPageComponent {
  private readonly notificationsService = inject(NotificationsService);
  private readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly markingAll = signal(false);
  protected readonly markingId = signal<string | null>(null);
  protected readonly notifications = signal<AppNotification[]>([]);
  protected readonly currentPage = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly totalItems = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly hasNotifications = computed(() => this.notifications().length > 0);

  constructor() {
    this.loadNotifications(1);
  }

  protected loadNotifications(page: number): void {
    this.loading.set(true);
    this.error.set('');

    this.notificationsService
      .getNotifications(page, 12)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.notifications.set(response.items);
          this.currentPage.set(response.meta.page);
          this.totalPages.set(Math.max(1, response.meta.totalPages));
          this.totalItems.set(response.meta.totalItems);
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحميل الإشعارات.')
      });
  }

  protected goToPage(page: number): void {
    const nextPage = Math.min(Math.max(1, page), this.totalPages());
    if (nextPage === this.currentPage()) {
      return;
    }
    this.loadNotifications(nextPage);
  }

  protected markAsRead(notification: AppNotification): void {
    if (notification.isRead) {
      return;
    }

    this.markingId.set(notification.id);
    this.notice.set('');
    this.error.set('');

    this.notificationsService
      .markAsRead(notification.id)
      .pipe(finalize(() => this.markingId.set(null)))
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.notifications.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          }
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحديث الإشعار.')
      });
  }

  protected markAllAsRead(): void {
    this.markingAll.set(true);
    this.notice.set('');
    this.error.set('');

    this.notificationsService
      .markAllAsRead()
      .pipe(finalize(() => this.markingAll.set(false)))
      .subscribe({
        next: (updatedCount) => {
          this.notifications.update((items) =>
            items.map((item) => ({
              ...item,
              isRead: true,
              readAt: item.readAt ?? new Date().toISOString()
            }))
          );
          this.notice.set(updatedCount > 0 ? `تم تحديث ${updatedCount} إشعارات.` : 'لا توجد إشعارات جديدة.');
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحديث الإشعارات.')
      });
  }

  protected notificationLink(notification: AppNotification): { path: string; queryParams?: Record<string, string> } | null {
    const orderId = typeof notification.data?.['orderId'] === 'string' ? notification.data['orderId'] : '';
    if (orderId) {
      if (this.auth.user()?.role === 'admin') {
        return { path: '/admin/orders', queryParams: { orderId } };
      }
      return { path: '/orders' };
    }
    return null;
  }

  protected notificationTypeLabel(type: string): string {
    switch (type) {
      case 'order_created':
        return 'تم إنشاء الطلب';
      case 'payment_initiated':
        return 'بدء الدفع';
      case 'order_paid':
        return 'تم الدفع';
      case 'order_cancelled':
        return 'طلب ملغي';
      case 'order_in_progress':
        return 'قيد التنفيذ';
      case 'order_completed':
        return 'مكتمل';
      case 'delivery_updated':
        return 'تحديث توصيل';
      default:
        return type;
    }
  }
}
