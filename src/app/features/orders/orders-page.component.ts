import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { Order } from '../../core/models/api.models';
import { OrdersService } from '../../core/services/orders.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-orders-page',
  imports: [DatePipe, CurrencyPipe, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './orders-page.component.html',
  styleUrl: './orders-page.component.css'
})
export class OrdersPageComponent {
  private readonly ordersService = inject(OrdersService);

  protected readonly loading = signal(true);
  protected readonly orders = signal<Order[]>([]);
  protected readonly error = signal('');
  protected readonly trackingByOrderId = signal<Record<string, {
    orderId: string;
    deliveryStatus: string;
    trackingNumber: string | null;
    shippingCarrier: string | null;
    trackingUrl: string | null;
    currentLocation: string | null;
    trackingNote: string | null;
    estimatedDeliveryAt: string | null;
    shippedAt: string | null;
    outForDeliveryAt: string | null;
    deliveredAt: string | null;
    deliveryStatusUpdatedAt: string | null;
  }>>({});
  protected readonly loadingTrackingOrderId = signal<string | null>(null);

  constructor() {
    this.loadOrders();
  }

  protected loadOrders(): void {
    this.loading.set(true);
    this.error.set('');

    this.ordersService
      .getMyOrders()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (orders) => this.orders.set(orders),
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحميل الطلبات.')
      });
  }

  protected loadTracking(orderId: string): void {
    this.loadingTrackingOrderId.set(orderId);
    this.ordersService.getOrderTracking(orderId).pipe(finalize(() => this.loadingTrackingOrderId.set(null))).subscribe({
      next: (tracking) => {
        this.trackingByOrderId.update((current) => ({
          ...current,
          [orderId]: tracking
        }));
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'تعذر تحميل بيانات التتبع.');
      }
    });
  }
}
