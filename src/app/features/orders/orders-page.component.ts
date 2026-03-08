import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Order } from '../../core/models/api.models';
import { CheckoutAccessService } from '../../core/services/checkout-access.service';
import { OrdersService } from '../../core/services/orders.service';
import { PaymentsService } from '../../core/services/payments.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-orders-page',
  imports: [DatePipe, CurrencyPipe, RouterLink, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './orders-page.component.html',
  styleUrl: './orders-page.component.css'
})
export class OrdersPageComponent {
  private readonly ordersService = inject(OrdersService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly checkoutAccessService = inject(CheckoutAccessService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly orders = signal<Order[]>([]);
  protected readonly error = signal('');
  protected readonly paymentNotice = signal('');
  protected readonly cancellingOrderId = signal<string | null>(null);
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
    this.consumePaymentReturnParams();
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
        this.error.set(err?.error?.message ?? 'تعذر تحميل تتبع الشحنة.');
      }
    });
  }

  protected canResumePayment(order: Order): boolean {
    return ['pending_payment', 'payment_initiated'].includes(
      String(order.status ?? '').toLowerCase().trim(),
    );
  }

  protected continuePayment(orderId: string): void {
    this.checkoutAccessService.allowOnce();
    void this.router.navigate(['/checkout'], {
      queryParams: { orderId },
    });
  }

  protected canCancelInitialOrder(order: Order): boolean {
    const status = String(order.status ?? '').toLowerCase().trim();
    const deliveryStatus = String(order.deliveryStatus ?? '')
      .toLowerCase()
      .trim();

    if (
      deliveryStatus === 'out_for_delivery' ||
      deliveryStatus === 'delivered' ||
      deliveryStatus === 'cancelled'
    ) {
      return false;
    }

    return [
      'pending_payment',
      'payment_initiated',
      'paid',
      'in_progress',
    ].includes(status);
  }

  protected cancelOrder(order: Order): void {
    if (!this.canCancelInitialOrder(order) || this.cancellingOrderId()) {
      return;
    }

    this.cancellingOrderId.set(order.id);
    this.error.set('');
    this.paymentNotice.set('');

    this.ordersService
      .cancelOrder(order.id)
      .pipe(finalize(() => this.cancellingOrderId.set(null)))
      .subscribe({
        next: (updatedOrder) => {
          this.orders.update((orders) =>
            orders.map((item) =>
              item.id === updatedOrder.id ? updatedOrder : item,
            ),
          );
          this.paymentNotice.set('تم إلغاء الطلب بنجاح.');
        },
        error: (err) => {
          const message =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر إلغاء الطلب. حاول مجددًا.';
          this.error.set(message);
        },
      });
  }

  private consumePaymentReturnParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const paymentId =
      params.get('paymentId') ?? params.get('payment_id') ?? params.get('id') ?? '';
    const status =
      params.get('status') ?? params.get('paymentStatus') ?? params.get('payment_status') ?? '';
    const message = params.get('message') ?? '';

    if (status || message) {
      const statusLabel = this.toPaymentStatusLabel(status);
      this.paymentNotice.set(
        `حالة الدفع: ${statusLabel}${message ? ` - ${message}` : ''}`,
      );
    }

    if (!paymentId) {
      return;
    }

    this.paymentsService.syncPayment(paymentId).subscribe({
      next: (result) => {
        if (result.status) {
          this.paymentNotice.set(`تم تحديث حالة الدفع: ${this.toPaymentStatusLabel(result.status)}`);
        }
        this.loadOrders();
      },
      error: () => {
        // Do not block orders page on sync failure.
      },
    });
  }

  private toPaymentStatusLabel(status: string | null | undefined): string {
    const normalized = String(status ?? '').toLowerCase().trim();
    switch (normalized) {
      case 'paid':
        return 'مدفوع';
      case 'failed':
        return 'فشل الدفع';
      case 'authorized':
        return 'مُعتمد';
      case 'captured':
        return 'تم التحصيل';
      case 'refunded':
        return 'تم الاسترجاع';
      case 'pending':
      case 'pending_payment':
      case 'payment_initiated':
        return 'قيد الانتظار';
      default:
        return normalized || 'غير معروف';
    }
  }
}
