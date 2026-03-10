import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  AdminOrderActionPayload,
  AdminOrderActionType,
  BulkAdminOrderActionPayload,
  AdminOrderAuditAction
} from '../../core/models/admin-orders.models';
import { DeliveryStatus } from '../../core/models/tracking.models';

export function adminOrderActionLabel(action: AdminOrderActionType): string {
  switch (action) {
    case 'update_order_status':
      return 'تحديث حالة الطلب';
    case 'update_delivery_tracking':
      return 'تحديث حالة وبيانات الشحن';
    case 'cancel_order':
      return 'إلغاء الطلب';
    default:
      return 'تحديث حالة الطلب';
  }
}

export function adminAuditActionLabel(action: AdminOrderAuditAction): string {
  switch (action) {
    case 'note_added':
      return 'إضافة ملاحظة';
    case 'order_status_updated':
      return 'تحديث حالة الطلب';
    case 'delivery_tracking_updated':
      return 'تحديث بيانات الشحن';
    case 'order_cancelled':
      return 'إلغاء الطلب';
    case 'bulk_action_executed':
      return 'تنفيذ إجراء جماعي';
    default:
      return 'عملية إدارية';
  }
}

export function adminAuditSeverity(action: AdminOrderAuditAction): 'danger' | 'info' | 'neutral' {
  if (action === 'order_cancelled') {
    return 'danger';
  }
  if (action === 'order_status_updated' || action === 'delivery_tracking_updated' || action === 'bulk_action_executed') {
    return 'info';
  }
  return 'neutral';
}

export function actionPayloadValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? {}) as {
      action?: AdminOrderActionType;
      orderStatus?: unknown;
      deliveryStatus?: unknown;
      note?: unknown;
    };

    if (!value.action) {
      return { actionRequired: true };
    }

    if (value.action === 'update_order_status' && !isFilled(value.orderStatus)) {
      return { orderStatusRequired: true };
    }

    if (value.action === 'update_delivery_tracking' && !isFilled(value.deliveryStatus)) {
      return { deliveryStatusRequired: true };
    }

    if (typeof value.note === 'string' && value.note.trim().length > 500) {
      return { noteTooLong: true };
    }

    return null;
  };
}

export function sanitizeAdminOrderActionPayload(value: {
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
}): AdminOrderActionPayload {
  const payload: AdminOrderActionPayload = { action: value.action };

  if (value.action === 'update_order_status' && isFilled(value.orderStatus)) {
    payload.orderStatus = value.orderStatus as AdminOrderActionPayload['orderStatus'];
  }

  if (value.action === 'update_delivery_tracking') {
    if (value.deliveryStatus) {
      payload.deliveryStatus = value.deliveryStatus;
    }
    if (isFilled(value.trackingNumber)) {
      payload.trackingNumber = value.trackingNumber.trim();
    }
    if (isFilled(value.shippingCarrier)) {
      payload.shippingCarrier = value.shippingCarrier.trim();
    }
    if (isFilled(value.trackingUrl)) {
      payload.trackingUrl = value.trackingUrl.trim();
    }
    if (isFilled(value.currentLocation)) {
      payload.currentLocation = value.currentLocation.trim();
    }
    if (isFilled(value.trackingNote)) {
      payload.trackingNote = value.trackingNote.trim();
    }
    if (isFilled(value.estimatedDeliveryAt)) {
      payload.estimatedDeliveryAt = new Date(value.estimatedDeliveryAt).toISOString();
    }
  }

  if (isFilled(value.note)) {
    payload.note = value.note.trim();
  }

  return payload;
}

export function buildBulkActionPayload(orderIds: string[], action: AdminOrderActionPayload): BulkAdminOrderActionPayload {
  return {
    orderIds: [...new Set(orderIds.map((item) => item.trim()).filter((item) => item.length > 0))],
    action
  };
}

export function toggleBulkSelection(current: string[], orderId: string, checked: boolean): string[] {
  const normalizedId = orderId.trim();
  if (!normalizedId) {
    return current;
  }

  const next = new Set(current);
  if (checked) {
    next.add(normalizedId);
  } else {
    next.delete(normalizedId);
  }
  return [...next];
}

export function mapAdminOrderApiError(err: unknown, fallback = 'تعذر تنفيذ العملية.'): string {
  const message = extractServerMessage(err).toLowerCase();
  if (!message) {
    return fallback;
  }

  if (message.includes('forbidden') || message.includes('unauthorized')) {
    return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  }
  if (message.includes('orderstatus') || message.includes('deliverystatus') || message.includes('required')) {
    return 'الرجاء استكمال الحقول الإلزامية قبل الإرسال.';
  }
  if (message.includes('invalid transition') || message.includes('cannot transition')) {
    return 'لا يمكن تنفيذ هذا الانتقال للحالة الحالية للطلب.';
  }
  return extractServerMessage(err) || fallback;
}

function isFilled(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function extractServerMessage(err: unknown): string {
  const response = (err as { error?: Record<string, unknown> } | null)?.error;
  if (!response || typeof response !== 'object') {
    return '';
  }
  const message = response['message'];
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' | ');
  }
  return '';
}
