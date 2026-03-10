import { anomalyTypeLabel, mapInventoryApiError } from './admin-inventory.helpers';

describe('admin-inventory helpers', () => {
  it('maps anomaly type to Arabic labels', () => {
    expect(anomalyTypeLabel('negative_stock')).toBe('مخزون سالب');
    expect(anomalyTypeLabel('negative_reserved_stock')).toBe('محجوز سالب');
    expect(anomalyTypeLabel('reserved_stock_mismatch')).toBe('عدم تطابق المخزون المحجوز');
  });

  it('maps API errors to Arabic-friendly messages', () => {
    const unauthorizedError = { error: { message: 'Unauthorized request' } };
    expect(mapInventoryApiError(unauthorizedError)).toBe('لا تملك صلاحية تنفيذ هذا الإجراء.');

    const invalidError = { error: { message: 'Invalid payload' } };
    expect(mapInventoryApiError(invalidError)).toBe('البيانات المدخلة غير صحيحة. تحقق من القيم ثم أعد المحاولة.');
  });
});
