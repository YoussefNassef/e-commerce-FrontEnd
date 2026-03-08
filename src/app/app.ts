import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { AppNotification, NotificationsService } from './core/services/notifications.service';
import { CartDrawerComponent } from './features/cart/cart-drawer.component';
import { signal } from '@angular/core';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CartDrawerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly unreadNotifications = signal(0);
  protected readonly cartDrawerOpen = signal(false);
  protected readonly notificationsPanelOpen = signal(false);
  protected readonly notificationsLoading = signal(false);
  protected readonly notificationsPanelError = signal('');
  protected readonly notificationPreview = signal<AppNotification[]>([]);
  private readonly router = inject(Router);
  private readonly notificationsService = inject(NotificationsService);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.auth.bootstrapSession().subscribe();
        this.refreshUnreadNotifications();
      } else {
        this.unreadNotifications.set(0);
      }
    });
  }

  protected openCartDrawer(): void {
    this.cartDrawerOpen.set(true);
  }

  protected closeCartDrawer(): void {
    this.cartDrawerOpen.set(false);
  }

  protected logout(): void {
    this.cartDrawerOpen.set(false);
    this.notificationsPanelOpen.set(false);
    this.notificationPreview.set([]);
    this.unreadNotifications.set(0);
    this.auth.logout();
    this.router.navigateByUrl('/auth');
  }

  protected toggleNotificationsPanel(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const open = !this.notificationsPanelOpen();
    this.notificationsPanelOpen.set(open);
    if (open) {
      this.loadNotificationsPreview();
    }
  }

  protected closeNotificationsPanel(): void {
    this.notificationsPanelOpen.set(false);
  }

  protected openNotification(notification: AppNotification): void {
    const target = this.resolveNotificationTarget(notification);
    this.notificationsPanelOpen.set(false);

    if (!notification.isRead) {
      this.notificationsService.markAsRead(notification.id).subscribe({
        next: () => {
          this.notificationPreview.update((items) =>
            items.map((item) =>
              item.id === notification.id
                ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }
                : item
            )
          );
          this.unreadNotifications.update((count) => Math.max(0, count - 1));
          this.router.navigate(target.commands, { queryParams: target.queryParams });
        },
        error: () => this.router.navigate(target.commands, { queryParams: target.queryParams })
      });
      return;
    }

    this.router.navigate(target.commands, { queryParams: target.queryParams });
  }

  protected openNotificationsPage(): void {
    this.notificationsPanelOpen.set(false);
    this.router.navigateByUrl('/notifications');
  }

  protected refreshUnreadNotifications(): void {
    this.notificationsService.getUnreadCount().subscribe({
      next: (count) => this.unreadNotifications.set(count),
      error: () => this.unreadNotifications.set(0)
    });
  }

  private loadNotificationsPreview(): void {
    this.notificationsLoading.set(true);
    this.notificationsPanelError.set('');

    this.notificationsService
      .getNotifications(1, 6)
      .pipe(finalize(() => this.notificationsLoading.set(false)))
      .subscribe({
        next: (response) => this.notificationPreview.set(response.items),
        error: () => {
          this.notificationPreview.set([]);
          this.notificationsPanelError.set('تعذر تحميل الإشعارات.');
        }
      });
  }

  private resolveNotificationTarget(
    notification: AppNotification
  ): { commands: string[]; queryParams?: Record<string, string> } {
    const orderId = typeof notification.data?.['orderId'] === 'string' ? notification.data['orderId'] : '';
    if (orderId) {
      if (this.auth.user()?.role === 'admin') {
        return { commands: ['/admin/orders'], queryParams: { orderId } };
      }
      return { commands: ['/orders'] };
    }
    return { commands: ['/notifications'] };
  }
}
