import { CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  AdminOrderActionPayload,
  AdminOrderActionType,
  AdminOrderAuditItem,
  BulkAdminOrderActionResponse
} from '../../core/models/admin-orders.models';
import { Order } from '../../core/models/api.models';
import { DeliveryStatus, OrderTrackingDto } from '../../core/models/tracking.models';
import { AdminOrdersService } from '../../core/services/admin-orders.service';
import { AdminService } from '../../core/services/admin.service';
import { OrdersService } from '../../core/services/orders.service';
import { PaymentsService } from '../../core/services/payments.service';
import { TrackingService } from '../../core/services/tracking.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { deliveryStatusLabel } from '../orders/order-tracking.helpers';
import {
  actionPayloadValidator,
  adminAuditActionLabel,
  adminAuditSeverity,
  adminOrderActionLabel,
  buildBulkActionPayload,
  mapAdminOrderApiError,
  sanitizeAdminOrderActionPayload,
  toggleBulkSelection
} from './admin-order-ops.helpers';

interface AdminOrderListItem {
  id: string;
  status: string;
  deliveryStatus: string;
  totalAmount: number;
  userName: string;
  createdAt: string;
}

@Component({
  selector: 'app-admin-orders-page',
  imports: [CurrencyPipe, DatePipe, NgClass, ReactiveFormsModule, ButtonComponent, CardComponent],
  templateUrl: './admin-orders-page.component.html',
  styleUrl: './admin-orders-page.component.css'
})
export class AdminOrdersPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly ordersService = inject(OrdersService);
  private readonly trackingService = inject(TrackingService);
  private readonly adminOrdersService = inject(AdminOrdersService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly loadingList = signal(false);
  protected readonly loadingOrder = signal(false);
  protected readonly loadingAudit = signal(false);
  protected readonly reconcilingPayments = signal(false);
  protected readonly runningSingleAction = signal(false);
  protected readonly addingAdminNote = signal(false);
  protected readonly runningBulkAction = signal(false);

  protected readonly listError = signal('');
  protected readonly orderError = signal('');
  protected readonly auditError = signal('');
  protected readonly toastMessage = signal('');
  protected readonly toastType = signal<'success' | 'error'>('success');

  protected readonly orders = signal<AdminOrderListItem[]>([]);
  protected readonly selectedOrderIds = signal<string[]>([]);
  protected readonly selectedOrderId = signal<string | null>(null);
  protected readonly selectedOrder = signal<Order | null>(null);
  protected readonly selectedTracking = signal<OrderTrackingDto | null>(null);

  protected readonly auditItems = signal<AdminOrderAuditItem[]>([]);
  protected readonly auditMeta = signal({
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });

  protected readonly actionTypes: readonly AdminOrderActionType[] = [
    'update_order_status',
    'update_delivery_tracking',
    'cancel_order'
  ];
  protected readonly orderStatuses = [
    'pending_payment',
    'payment_initiated',
    'paid',
    'in_progress',
    'completed',
    'cancelled'
  ] as const;
  protected readonly deliveryStatuses: readonly DeliveryStatus[] = [
    'pending',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ];

  protected readonly lookupForm = this.fb.nonNullable.group({
    orderId: ['', [Validators.required, Validators.minLength(8)]]
  });

  protected readonly actionForm = this.fb.nonNullable.group(
    {
      action: ['update_order_status' as AdminOrderActionType, [Validators.required]],
      orderStatus: [''],
      deliveryStatus: ['' as DeliveryStatus | ''],
      trackingNumber: [''],
      shippingCarrier: [''],
      trackingUrl: [''],
      currentLocation: [''],
      trackingNote: [''],
      estimatedDeliveryAt: [''],
      note: ['', [Validators.maxLength(500)]]
    },
    { validators: [actionPayloadValidator()] }
  );

  protected readonly noteForm = this.fb.nonNullable.group({
    note: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(500)]]
  });

  protected readonly bulkActionForm = this.fb.nonNullable.group(
    {
      action: ['update_order_status' as AdminOrderActionType, [Validators.required]],
      orderStatus: [''],
      deliveryStatus: ['' as DeliveryStatus | ''],
      trackingNumber: [''],
      shippingCarrier: [''],
      trackingUrl: [''],
      currentLocation: [''],
      trackingNote: [''],
      estimatedDeliveryAt: [''],
      note: ['', [Validators.maxLength(500)]]
    },
    { validators: [actionPayloadValidator()] }
  );

  protected readonly hasSelectedOrders = computed(() => this.selectedOrderIds().length > 0);
  protected readonly selectedOrdersCount = computed(() => this.selectedOrderIds().length);
  protected readonly allVisibleSelected = computed(() => {
    const list = this.orders();
    if (!list.length) {
      return false;
    }
    const selected = new Set(this.selectedOrderIds());
    return list.every((item) => selected.has(item.id));
  });

  protected readonly currentActionType = signal<AdminOrderActionType>('update_order_status');
  protected readonly currentBulkActionType = signal<AdminOrderActionType>('update_order_status');
  protected readonly singleActionBusy = computed(() => this.runningSingleAction() || this.loadingOrder());
  protected readonly bulkBusy = computed(() => this.runningBulkAction() || this.loadingList());

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }
    });

    this.loadOrdersList();
    this.prefillOrderFromQuery();
    this.bindActionTypeSignals();
  }

  protected loadOrdersList(): void {
    if (this.loadingList()) {
      return;
    }

    this.loadingList.set(true);
    this.listError.set('');

    this.adminService
      .getOverview()
      .pipe(finalize(() => this.loadingList.set(false)))
      .subscribe({
        next: (overview) => {
          this.orders.set(
            overview.recentOrders.map((item) => ({
              id: item.id,
              status: item.status,
              deliveryStatus: item.deliveryStatus,
              totalAmount: item.totalAmount,
              userName: item.userName,
              createdAt: item.createdAt
            }))
          );
        },
        error: (err) => {
          this.listError.set(mapAdminOrderApiError(err, 'تعذر تحميل قائمة الطلبات.'));
        }
      });
  }

  protected loadOrderByLookup(): void {
    if (this.lookupForm.invalid) {
      this.lookupForm.markAllAsTouched();
      return;
    }

    const orderId = this.lookupForm.controls.orderId.value.trim();
    if (!orderId) {
      return;
    }
    this.openOrderDetails(orderId);
  }

  protected openOrderDetails(orderId: string): void {
    const normalized = orderId.trim();
    if (!normalized || this.loadingOrder()) {
      return;
    }

    this.selectedOrderId.set(normalized);
    this.lookupForm.controls.orderId.setValue(normalized);
    this.loadSelectedOrderData(normalized, 1);
  }

  protected refreshSelectedOrderData(): void {
    const orderId = this.selectedOrderId();
    if (!orderId) {
      return;
    }
    this.loadSelectedOrderData(orderId, this.auditMeta().page);
  }

  protected toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedOrderIds.set(this.orders().map((item) => item.id));
      return;
    }
    this.selectedOrderIds.set([]);
  }

  protected toggleOrderSelection(orderId: string, checked: boolean): void {
    this.selectedOrderIds.update((current) => toggleBulkSelection(current, orderId, checked));
  }

  protected isOrderSelected(orderId: string): boolean {
    return this.selectedOrderIds().includes(orderId);
  }

  protected submitSingleAction(): void {
    const orderId = this.selectedOrderId();
    if (!orderId || this.runningSingleAction()) {
      return;
    }

    this.actionForm.updateValueAndValidity();
    if (this.actionForm.invalid) {
      this.actionForm.markAllAsTouched();
      this.showToast('الرجاء استكمال بيانات الإجراء قبل الإرسال.', 'error');
      return;
    }

    const payload = this.toActionPayload(this.actionForm.getRawValue() as ActionFormValue);
    this.runningSingleAction.set(true);
    this.orderError.set('');

    this.adminOrdersService
      .runOrderAdminAction(orderId, payload)
      .pipe(finalize(() => this.runningSingleAction.set(false)))
      .subscribe({
        next: () => {
          this.showToast('تم تنفيذ الإجراء على الطلب بنجاح.', 'success');
          this.actionForm.patchValue({ note: '' });
          this.loadSelectedOrderData(orderId, 1);
          this.loadOrdersList();
        },
        error: (err) => {
          this.showToast(mapAdminOrderApiError(err, 'تعذر تنفيذ الإجراء على الطلب.'), 'error');
        }
      });
  }

  protected addAdminNote(): void {
    const orderId = this.selectedOrderId();
    if (!orderId || this.addingAdminNote()) {
      return;
    }

    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }

    const note = this.noteForm.controls.note.value.trim();
    this.addingAdminNote.set(true);

    this.adminOrdersService
      .addOrderAdminNote(orderId, { note })
      .pipe(finalize(() => this.addingAdminNote.set(false)))
      .subscribe({
        next: () => {
          this.noteForm.reset({ note: '' });
          this.showToast('تمت إضافة الملاحظة بنجاح.', 'success');
          this.loadAudit(1);
        },
        error: (err) => this.showToast(mapAdminOrderApiError(err, 'تعذر إضافة الملاحظة.'), 'error')
      });
  }

  protected runBulkAction(): void {
    if (this.runningBulkAction()) {
      return;
    }

    const orderIds = this.selectedOrderIds();
    if (!orderIds.length) {
      this.showToast('اختر طلبًا واحدًا على الأقل لتنفيذ الإجراء الجماعي.', 'error');
      return;
    }

    this.bulkActionForm.updateValueAndValidity();
    if (this.bulkActionForm.invalid) {
      this.bulkActionForm.markAllAsTouched();
      this.showToast('بيانات الإجراء الجماعي غير مكتملة.', 'error');
      return;
    }

    const actionPayload = this.toActionPayload(this.bulkActionForm.getRawValue() as ActionFormValue);
    const payload = buildBulkActionPayload(orderIds, actionPayload);

    this.runningBulkAction.set(true);
    this.listError.set('');

    this.adminOrdersService
      .runBulkOrderAdminAction(payload)
      .pipe(finalize(() => this.runningBulkAction.set(false)))
      .subscribe({
        next: (result) => this.handleBulkActionSuccess(result),
        error: (err) => this.showToast(mapAdminOrderApiError(err, 'تعذر تنفيذ الإجراء الجماعي.'), 'error')
      });
  }

  protected loadAudit(page: number): void {
    const orderId = this.selectedOrderId();
    if (!orderId || this.loadingAudit()) {
      return;
    }

    this.loadingAudit.set(true);
    this.auditError.set('');

    this.adminOrdersService
      .getOrderAdminAudit(orderId, page, this.auditMeta().limit)
      .pipe(finalize(() => this.loadingAudit.set(false)))
      .subscribe({
        next: (response) => {
          this.auditItems.set(response.items);
          this.auditMeta.set(response.meta);
        },
        error: (err) => {
          this.auditItems.set([]);
          this.auditError.set(mapAdminOrderApiError(err, 'تعذر تحميل سجل العمليات الإدارية.'));
        }
      });
  }

  protected runPaymentReconciliation(): void {
    if (this.reconcilingPayments()) {
      return;
    }

    this.reconcilingPayments.set(true);
    this.paymentsService
      .reconcilePayments()
      .pipe(finalize(() => this.reconcilingPayments.set(false)))
      .subscribe({
        next: (summary) => {
          this.showToast(
            `تمت المراجعة: ناجح ${summary.paid} | فشل ${summary.failed} | بدون تغيير ${summary.unchanged}`,
            'success'
          );
        },
        error: (err) => {
          this.showToast(mapAdminOrderApiError(err, 'تعذر تشغيل تسوية المدفوعات.'), 'error');
        }
      });
  }

  protected orderStatusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'بانتظار الدفع';
      case 'payment_initiated':
        return 'تم بدء الدفع';
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

  protected actionLabel(action: AdminOrderActionType): string {
    return adminOrderActionLabel(action);
  }

  protected auditActionLabel(action: AdminOrderAuditItem['action']): string {
    return adminAuditActionLabel(action);
  }

  protected auditSeverityClass(action: AdminOrderAuditItem['action']): string {
    return adminAuditSeverity(action);
  }

  protected transitionSummary(item: AdminOrderAuditItem): string {
    const fromOrder = typeof item.metadata.fromOrderStatus === 'string' ? item.metadata.fromOrderStatus : '';
    const toOrder = typeof item.metadata.toOrderStatus === 'string' ? item.metadata.toOrderStatus : '';
    const fromDelivery = typeof item.metadata.fromDeliveryStatus === 'string' ? item.metadata.fromDeliveryStatus : '';
    const toDelivery = typeof item.metadata.toDeliveryStatus === 'string' ? item.metadata.toDeliveryStatus : '';

    if (fromOrder && toOrder) {
      return `حالة الطلب: ${this.orderStatusLabel(fromOrder)} -> ${this.orderStatusLabel(toOrder)}`;
    }
    if (fromDelivery && toDelivery) {
      return `حالة الشحن: ${this.deliveryStatusLabel(fromDelivery)} -> ${this.deliveryStatusLabel(toDelivery)}`;
    }
    return '';
  }

  private loadSelectedOrderData(orderId: string, auditPage: number): void {
    this.loadingOrder.set(true);
    this.orderError.set('');

    forkJoin({
      order: this.ordersService.getOrderById(orderId),
      tracking: this.trackingService.getOrderTracking(orderId)
    })
      .pipe(finalize(() => this.loadingOrder.set(false)))
      .subscribe({
        next: ({ order, tracking }) => {
          this.selectedOrder.set(order);
          this.selectedTracking.set(tracking);
          this.actionForm.patchValue({
            action: 'update_order_status',
            orderStatus: order?.status ?? '',
            deliveryStatus: tracking?.deliveryStatus ?? '',
            trackingNumber: tracking?.trackingNumber ?? '',
            shippingCarrier: tracking?.shippingCarrier ?? '',
            trackingUrl: tracking?.trackingUrl ?? '',
            currentLocation: tracking?.currentLocation ?? '',
            trackingNote: tracking?.trackingNote ?? '',
            estimatedDeliveryAt: tracking?.estimatedDeliveryAt ? this.toDateTimeLocal(tracking.estimatedDeliveryAt) : ''
          });
          this.currentActionType.set('update_order_status');
          this.loadAudit(auditPage);
        },
        error: (err) => {
          this.selectedOrder.set(null);
          this.selectedTracking.set(null);
          this.auditItems.set([]);
          this.orderError.set(mapAdminOrderApiError(err, 'تعذر تحميل بيانات الطلب.'));
        }
      });
  }

  private handleBulkActionSuccess(result: BulkAdminOrderActionResponse): void {
    this.showToast(`تم تنفيذ الإجراء الجماعي: نجاح ${result.successCount} | فشل ${result.failureCount}`, 'success');

    if (result.successes.length) {
      const successSet = new Set(result.successes);
      this.selectedOrderIds.update((ids) => ids.filter((id) => !successSet.has(id)));
    }

    const currentOrderId = this.selectedOrderId();
    if (currentOrderId && result.successes.includes(currentOrderId)) {
      this.loadSelectedOrderData(currentOrderId, 1);
    }

    this.loadOrdersList();
  }

  private toActionPayload(value: ActionFormValue): AdminOrderActionPayload {
    return sanitizeAdminOrderActionPayload(value);
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
    this.lookupForm.controls.orderId.setValue(orderId);
    this.openOrderDetails(orderId);
  }

  private bindActionTypeSignals(): void {
    this.actionForm.controls.action.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      const action = (value || 'update_order_status') as AdminOrderActionType;
      this.currentActionType.set(action);
      this.resetActionFormForType(this.actionForm, action);
    });

    this.bulkActionForm.controls.action.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      const action = (value || 'update_order_status') as AdminOrderActionType;
      this.currentBulkActionType.set(action);
      this.resetActionFormForType(this.bulkActionForm, action);
    });
  }

  private resetActionFormForType(form: typeof this.actionForm | typeof this.bulkActionForm, action: AdminOrderActionType): void {
    if (action === 'update_order_status') {
      form.patchValue({
        deliveryStatus: '',
        trackingNumber: '',
        shippingCarrier: '',
        trackingUrl: '',
        currentLocation: '',
        trackingNote: '',
        estimatedDeliveryAt: ''
      });
    } else if (action === 'update_delivery_tracking') {
      form.patchValue({ orderStatus: '' });
    } else if (action === 'cancel_order') {
      form.patchValue({
        orderStatus: '',
        deliveryStatus: '',
        trackingNumber: '',
        shippingCarrier: '',
        trackingUrl: '',
        currentLocation: '',
        trackingNote: '',
        estimatedDeliveryAt: ''
      });
    }
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
    }, 3500);
  }
}

type ActionFormValue = {
  action: AdminOrderActionType;
  orderStatus: string;
  deliveryStatus: DeliveryStatus | '';
  trackingNumber: string;
  shippingCarrier: string;
  trackingUrl: string;
  currentLocation: string;
  trackingNote: string;
  estimatedDeliveryAt: string;
  note: string;
};
