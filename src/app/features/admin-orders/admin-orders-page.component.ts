import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Order } from '../../core/models/api.models';
import { DeliveryStatus, OrderTrackingInfo, OrdersService } from '../../core/services/orders.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';

@Component({
  selector: 'app-admin-orders-page',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, ButtonComponent, CardComponent],
  templateUrl: './admin-orders-page.component.html',
  styleUrl: './admin-orders-page.component.css'
})
export class AdminOrdersPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ordersService = inject(OrdersService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly orderStatus = signal('');
  protected readonly order = signal<Order | null>(null);
  protected readonly tracking = signal<OrderTrackingInfo | null>(null);
  protected readonly trackingLoaded = signal(false);

  protected readonly deliveryStatuses: readonly DeliveryStatus[] = [
    'pending',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ];

  protected readonly form = this.fb.nonNullable.group({
    orderId: ['', [Validators.required, Validators.minLength(8)]],
    deliveryStatus: ['pending' as DeliveryStatus, [Validators.required]],
    trackingNumber: [''],
    shippingCarrier: [''],
    trackingUrl: [''],
    currentLocation: [''],
    trackingNote: [''],
    estimatedDeliveryAt: ['']
  });

  constructor() {
    this.prefillOrderFromQuery();
  }

  protected loadOrder(): void {
    if (this.form.controls.orderId.invalid) {
      this.form.controls.orderId.markAsTouched();
      return;
    }

    const orderId = this.form.controls.orderId.value.trim();
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');

    this.ordersService.getOrderById(orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.orderStatus.set(order.status);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'تعذر تحميل الطلب.');
      }
    });

    this.ordersService
      .getOrderTracking(orderId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (tracking) => {
          this.tracking.set(tracking);
          this.trackingLoaded.set(true);
          this.form.patchValue({
            deliveryStatus: (tracking.deliveryStatus as DeliveryStatus) || 'pending',
            trackingNumber: tracking.trackingNumber ?? '',
            shippingCarrier: tracking.shippingCarrier ?? '',
            trackingUrl: tracking.trackingUrl ?? '',
            currentLocation: tracking.currentLocation ?? '',
            trackingNote: tracking.trackingNote ?? '',
            estimatedDeliveryAt: tracking.estimatedDeliveryAt ? this.toDateTimeLocal(tracking.estimatedDeliveryAt) : ''
          });
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحميل بيانات التتبع.')
      });
  }

  protected saveTracking(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const orderId = this.form.controls.orderId.value.trim();
    if (!orderId) {
      this.error.set('أدخل رقم الطلب أولًا.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    const value = this.form.getRawValue();

    this.ordersService
      .updateOrderTracking(orderId, {
        deliveryStatus: value.deliveryStatus,
        trackingNumber: value.trackingNumber.trim() || undefined,
        shippingCarrier: value.shippingCarrier.trim() || undefined,
        trackingUrl: value.trackingUrl.trim() || undefined,
        currentLocation: value.currentLocation.trim() || undefined,
        trackingNote: value.trackingNote.trim() || undefined,
        estimatedDeliveryAt: value.estimatedDeliveryAt ? new Date(value.estimatedDeliveryAt).toISOString() : undefined
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.notice.set('تم تحديث حالة التوصيل بنجاح.');
          this.loadOrder();
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحديث بيانات التتبع.')
      });
  }

  protected orderStatusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'بانتظار الدفع';
      case 'payment_initiated':
        return 'بدء الدفع';
      case 'paid':
        return 'مدفوع';
      case 'in_progress':
        return 'قيد التنفيذ';
      case 'completed':
        return 'مكتمل';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  }

  protected deliveryStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'معلق';
      case 'processing':
        return 'تجهيز';
      case 'shipped':
        return 'تم الشحن';
      case 'out_for_delivery':
        return 'خرج للتسليم';
      case 'delivered':
        return 'تم التسليم';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  }

  private toDateTimeLocal(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private prefillOrderFromQuery(): void {
    const orderId = this.route.snapshot.queryParamMap.get('orderId')?.trim() ?? '';
    if (!orderId) {
      return;
    }
    this.form.controls.orderId.setValue(orderId);
    this.loadOrder();
  }
}
