import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Order } from '../../core/models/api.models';
import { DeliveryStatus, OrderTrackingDto } from '../../core/models/tracking.models';
import { OrdersService } from '../../core/services/orders.service';
import { TrackingService } from '../../core/services/tracking.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { trackingNumberRequiredForShippingValidator } from './admin-tracking.validators';
import { deliveryStatusLabel } from '../orders/order-tracking.helpers';

@Component({
  selector: 'app-admin-orders-page',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, ButtonComponent, CardComponent],
  templateUrl: './admin-orders-page.component.html',
  styleUrl: './admin-orders-page.component.css',
})
export class AdminOrdersPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ordersService = inject(OrdersService);
  private readonly trackingService = inject(TrackingService);
  private readonly route = inject(ActivatedRoute);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly toastMessage = signal('');
  protected readonly toastType = signal<'success' | 'error'>('success');
  protected readonly order = signal<Order | null>(null);
  protected readonly tracking = signal<OrderTrackingDto | null>(null);
  protected readonly trackingLoaded = signal(false);

  protected readonly deliveryStatuses: readonly DeliveryStatus[] = [
    'pending',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ];

  protected readonly form = this.fb.nonNullable.group(
    {
      orderId: ['', [Validators.required, Validators.minLength(8)]],
      deliveryStatus: ['pending' as DeliveryStatus, [Validators.required]],
      trackingNumber: [''],
      shippingCarrier: [''],
      trackingUrl: [''],
      currentLocation: [''],
      trackingNote: [''],
      estimatedDeliveryAt: [''],
    },
    { validators: [trackingNumberRequiredForShippingValidator] },
  );

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

    forkJoin({
      order: this.ordersService.getOrderById(orderId),
      tracking: this.trackingService.getOrderTracking(orderId),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ order, tracking }) => {
          this.order.set(order);
          this.tracking.set(tracking);
          this.trackingLoaded.set(true);
          this.form.patchValue({
            deliveryStatus: (tracking.deliveryStatus as DeliveryStatus) || 'pending',
            trackingNumber: tracking.trackingNumber ?? '',
            shippingCarrier: tracking.shippingCarrier ?? '',
            trackingUrl: tracking.trackingUrl ?? '',
            currentLocation: tracking.currentLocation ?? '',
            trackingNote: tracking.trackingNote ?? '',
            estimatedDeliveryAt: tracking.estimatedDeliveryAt
              ? this.toDateTimeLocal(tracking.estimatedDeliveryAt)
              : '',
          });
        },
        error: (err) => {
          const message =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحميل بيانات الطلب أو التتبع.';
          this.error.set(message);
        },
      });
  }

  protected saveTracking(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.errors?.['trackingNumberRequiredForShipping']) {
        this.showToast(
          'رقم التتبع مطلوب عند اختيار "تم الشحن" أو "خرج للتسليم".',
          'error',
        );
      }
      return;
    }

    const orderId = this.form.controls.orderId.value.trim();
    if (!orderId) {
      this.error.set('أدخل رقم الطلب أولًا.');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const value = this.form.getRawValue();

    this.trackingService
      .updateOrderTracking(orderId, {
        deliveryStatus: value.deliveryStatus,
        trackingNumber: value.trackingNumber.trim() || undefined,
        shippingCarrier: value.shippingCarrier.trim() || undefined,
        trackingUrl: value.trackingUrl.trim() || undefined,
        currentLocation: value.currentLocation.trim() || undefined,
        trackingNote: value.trackingNote.trim() || undefined,
        estimatedDeliveryAt: value.estimatedDeliveryAt
          ? new Date(value.estimatedDeliveryAt).toISOString()
          : undefined,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.showToast('تم تحديث بيانات التتبع بنجاح.', 'success');
          this.loadOrder();
        },
        error: (err) => {
          const message =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحديث بيانات التتبع.';
          this.showToast(message, 'error');
        },
      });
  }

  protected shouldRequireTrackingNumber(): boolean {
    const status = this.form.controls.deliveryStatus.value;
    return status === 'shipped' || status === 'out_for_delivery';
  }

  protected hasTrackingNumberRuleError(): boolean {
    return (
      !!this.form.errors?.['trackingNumberRequiredForShipping'] &&
      (this.form.touched || this.form.controls.trackingNumber.touched)
    );
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
    return deliveryStatusLabel(status);
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

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set('');
      this.toastTimer = null;
    }, 3000);
  }
}
