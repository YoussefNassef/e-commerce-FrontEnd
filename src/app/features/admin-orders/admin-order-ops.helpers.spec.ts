import { FormBuilder } from '@angular/forms';
import {
  actionPayloadValidator,
  adminAuditActionLabel,
  buildBulkActionPayload,
  mapAdminOrderApiError,
  sanitizeAdminOrderActionPayload,
  toggleBulkSelection
} from './admin-order-ops.helpers';

describe('admin-order-ops helpers', () => {
  it('validates conditional required fields based on action type', () => {
    const fb = new FormBuilder();
    const form = fb.group(
      {
        action: ['update_order_status'],
        orderStatus: [''],
        deliveryStatus: [''],
        note: ['']
      },
      { validators: [actionPayloadValidator()] }
    );

    form.updateValueAndValidity();
    expect(form.errors?.['orderStatusRequired']).toBeTruthy();

    form.patchValue({ orderStatus: 'paid' });
    form.updateValueAndValidity();
    expect(form.errors).toBeNull();

    form.patchValue({ action: 'update_delivery_tracking', orderStatus: '', deliveryStatus: '' });
    form.updateValueAndValidity();
    expect(form.errors?.['deliveryStatusRequired']).toBeTruthy();
  });

  it('handles bulk selection and payload building correctly', () => {
    let selected = toggleBulkSelection([], 'a1', true);
    selected = toggleBulkSelection(selected, 'a2', true);
    selected = toggleBulkSelection(selected, 'a1', false);
    expect(selected).toEqual(['a2']);

    const action = sanitizeAdminOrderActionPayload({
      action: 'update_order_status',
      orderStatus: 'completed',
      deliveryStatus: '',
      trackingNumber: '',
      shippingCarrier: '',
      trackingUrl: '',
      currentLocation: '',
      trackingNote: '',
      estimatedDeliveryAt: '',
      note: 'done'
    });
    const payload = buildBulkActionPayload(['a2', 'a2'], action);
    expect(payload.orderIds).toEqual(['a2']);
    expect(payload.action.orderStatus).toBe('completed');
  });

  it('maps audit action labels and api errors in Arabic', () => {
    expect(adminAuditActionLabel('order_cancelled')).toBe('إلغاء الطلب');
    expect(adminAuditActionLabel('delivery_tracking_updated')).toBe('تحديث بيانات الشحن');

    expect(mapAdminOrderApiError({ error: { message: 'forbidden' } })).toBe('لا تملك صلاحية تنفيذ هذا الإجراء.');
    expect(mapAdminOrderApiError({ error: { message: 'invalid transition' } })).toBe(
      'لا يمكن تنفيذ هذا الانتقال للحالة الحالية للطلب.'
    );
  });
});
